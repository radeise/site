<script>
  import { onMount, onDestroy } from 'svelte';
  import { Tissage } from '../lib/tissage.js';
  import { FORMATS, FORMAT_DEFAULT, RATIO, px } from '../lib/formats.js';

  // --- State ---
  let tissage = $state(null);

  // Paramètres utilisateur
  let formatKey = $state(FORMAT_DEFAULT);
  let warpThickness = $state(0.3);
  let weftThickness = $state(0.3);
  let weftSpace = $state(0.06);
  let id = $state(Math.floor(Math.random() * 100000));
  let idInput = $state('');

  // Infos dérivées
  let infoText = $derived(tissage ? `${tissage.warpQuantity} chaînes × ${tissage.weftQuantity} trames — ${tissage.largeurTissage.toFixed(1)} × ${tissage.hauteurTissage.toFixed(1)} cm` : '');

  // Formats pour le sélecteur
  const formatEntries = Object.entries(FORMATS);

  // Canvas & zoom
  const DPR = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const BASE_SCALE = 0.5; // cm → px base scale (half of RATIO)

  let canvasEl;
  let canvasWrap;
  let canvasArea;
  let ctx;

  let baseW = $state(400);
  let baseH = $state(600);

  // Zoom / Pan
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let spaceDown = false;
  let isPanning = false;
  let panMX = 0, panMY = 0, panSX = 0, panSY = 0;

  function computeBaseSize() {
    const fmt = FORMATS[formatKey];
    baseW = Math.round(px(fmt.cadre.x) * BASE_SCALE);
    baseH = Math.round(px(fmt.cadre.y) * BASE_SCALE);
  }

  // --- Canvas size & transform ---
  function applyCanvasSize() {
    if (!canvasEl || !ctx) return;
    computeBaseSize();
    const pw = Math.round(baseW * zoom * DPR);
    const ph = Math.round(baseH * zoom * DPR);
    canvasEl.width = pw;
    canvasEl.height = ph;
    canvasEl.style.width = Math.round(baseW * zoom) + 'px';
    canvasEl.style.height = Math.round(baseH * zoom) + 'px';
    const sf = pw / baseW;
    ctx.setTransform(sf, 0, 0, sf, 0, 0);
  }

  function updateTransform() {
    if (!canvasWrap) return;
    canvasWrap.style.transform = `translate(${panX}px,${panY}px)`;
  }

  function centerCanvas() {
    if (!canvasArea) return;
    const ar = canvasArea.getBoundingClientRect();
    const cw = baseW * zoom, ch = baseH * zoom;
    panX = Math.max(0, (ar.width - cw) / 2);
    panY = Math.max(0, (ar.height - ch) / 2);
    updateTransform();
  }

  function clampPan() {
    if (!canvasArea) return;
    const ar = canvasArea.getBoundingClientRect();
    const cw = baseW * zoom, ch = baseH * zoom;
    const minX = Math.min(0, ar.width - cw - 20);
    const maxX = Math.max(ar.width - cw, 20);
    const minY = Math.min(0, ar.height - ch - 20);
    const maxY = Math.max(ar.height - ch, 20);
    panX = Math.max(minX, Math.min(maxX, panX));
    panY = Math.max(minY, Math.min(maxY, panY));
  }

  // --- Zoom ---
  function zoomAt(newZoom, pivotCX, pivotCY) {
    newZoom = Math.max(0.5, Math.min(4, Math.round(newZoom * 20) / 20));
    if (newZoom === zoom) return;
    const ar = canvasArea.getBoundingClientRect();
    const ax = pivotCX - ar.left, ay = pivotCY - ar.top;
    const lx = (ax - panX) / zoom, ly = (ay - panY) / zoom;
    zoom = newZoom;
    applyCanvasSize();
    panX = ax - lx * zoom;
    panY = ay - ly * zoom;
    clampPan();
    updateTransform();
    render();
  }

  function zoomCenter(delta) {
    const ar = canvasArea.getBoundingClientRect();
    zoomAt(zoom + delta, ar.left + ar.width / 2, ar.top + ar.height / 2);
  }

  function resetZoom() {
    zoom = 1;
    applyCanvasSize();
    centerCanvas();
    render();
  }

  // --- Pan ---
  function startPan(cx, cy) {
    isPanning = true;
    panMX = cx; panMY = cy;
    panSX = panX; panSY = panY;
    if (canvasEl) canvasEl.style.cursor = 'grabbing';
  }

  function doPan(cx, cy) {
    panX = panSX + (cx - panMX);
    panY = panSY + (cy - panMY);
    clampPan();
    updateTransform();
  }

  function endPan() {
    isPanning = false;
    if (canvasEl) canvasEl.style.cursor = spaceDown ? 'grab' : 'pointer';
  }

  // --- Initialisation ---
  function buildTissage() {
    tissage = new Tissage({ formatKey, warpThickness, weftThickness, weftSpace, id });
    idInput = String(tissage.id);
  }

  // --- Rendu Canvas ---
  function render() {
    if (!ctx || !tissage) return;
    const s = BASE_SCALE;

    ctx.clearRect(0, 0, baseW, baseH);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, baseW, baseH);

    const ancX = px(tissage.ancrage.x) * s;
    const ancY = px(tissage.ancrage.y) * s;

    // Cellules noires (trame au-dessus)
    ctx.fillStyle = '#000';
    for (let y = 0; y < tissage.weftQuantity; y++) {
      for (let x = 0; x < tissage.warpQuantity; x++) {
        const cell = tissage.grid[y][x];
        if (cell.isBlack) {
          ctx.fillRect(
            ancX + px(cell.position.x) * s,
            ancY + px(cell.position.y) * s,
            px(tissage.warpThickness) * s,
            px(tissage.weftThickness) * s
          );
        }
      }
    }

    // Fils de chaîne (lignes verticales grises)
    ctx.strokeStyle = 'rgb(120,120,120)';
    ctx.lineWidth = 0.5;

    const topExt = px(1) * s;
    const warpW = px(tissage.warpThickness) * s;
    const totalH = px(tissage.hauteurTissage) * s;

    // Première colonne : segments sur cellules noires
    for (let y = 0; y < tissage.weftQuantity; y++) {
      const cell = tissage.grid[y][0];
      if (cell.isBlack) {
        const cy = ancY + px(cell.position.y) * s;
        const segTop = y === 0 ? cy - topExt : cy;
        const segBot = y === tissage.weftQuantity - 1 ? cy + px(tissage.weftThickness) * s + topExt : cy + px(tissage.weftThickness) * s;
        ctx.beginPath();
        ctx.moveTo(ancX, segTop);
        ctx.lineTo(ancX, segBot);
        ctx.stroke();
      }
    }

    // Colonnes intermédiaires : ligne continue
    for (let x = 1; x < tissage.warpQuantity; x++) {
      const cx = ancX + px(x * tissage.warpThickness) * s;
      ctx.beginPath();
      ctx.moveTo(cx, ancY - topExt);
      ctx.lineTo(cx, ancY + totalH + topExt);
      ctx.stroke();
    }

    // Dernière colonne : segments sur cellules noires
    const lastX = ancX + px(tissage.warpQuantity * tissage.warpThickness) * s;
    for (let y = 0; y < tissage.weftQuantity; y++) {
      const cell = tissage.grid[y][tissage.warpQuantity - 1];
      if (cell.isBlack) {
        const cy = ancY + px(cell.position.y) * s;
        const segTop = y === 0 ? cy - topExt : cy;
        const segBot = y === tissage.weftQuantity - 1 ? cy + px(tissage.weftThickness) * s + topExt : cy + px(tissage.weftThickness) * s;
        ctx.beginPath();
        ctx.moveTo(lastX, segTop);
        ctx.lineTo(lastX, segBot);
        ctx.stroke();
      }
    }

    // Cadre
    ctx.strokeStyle = 'rgb(120,120,120)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(0, 0, baseW - 1, baseH - 1);

    // Timecode
    ctx.fillStyle = 'rgb(120,120,120)';
    ctx.font = '8px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(tissage.getTimecode(), ancX, ancY + totalH + topExt + 4);
  }

  // --- Actions ---
  function regenerate() {
    id = Math.floor(Math.random() * 100000);
    buildTissage();
    applyCanvasSize();
    centerCanvas();
    render();
  }

  function applyId() {
    const parsed = parseInt(idInput, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 99999) {
      id = parsed;
      buildTissage();
      render();
    }
  }

  function updateParams() {
    buildTissage();
    computeBaseSize();
    applyCanvasSize();
    centerCanvas();
    render();
  }

  // --- Export PDF ---
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportAllPDF() {
    if (!tissage) return;

    const { jsPDF } = await import('jspdf');
    const t = tissage;
    const ratio = RATIO;

    // --- 1. Preview.pdf ---
    const previewPdf = new jsPDF({
      orientation: t.format.cadre.x > t.format.cadre.y ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [t.format.cadre.x * ratio, t.format.cadre.y * ratio],
    });

    for (let y = 0; y < t.weftQuantity; y++) {
      for (let x = 0; x < t.warpQuantity; x++) {
        const cell = t.grid[y][x];
        if (cell.isBlack) {
          previewPdf.setFillColor(0, 0, 0);
          previewPdf.rect(
            t.ancrage.x * ratio + cell.position.x * ratio,
            t.ancrage.y * ratio + cell.position.y * ratio,
            t.warpThickness * ratio,
            t.weftThickness * ratio,
            'F'
          );
        }
      }
    }

    const previewBlob = previewPdf.output('blob');
    downloadBlob(previewBlob, `Preview-${t.id}.pdf`);
    await delay(500);

    // --- 2. ChaîneInverse.pdf (miroir horizontal) ---
    const chainePdf = new jsPDF({
      orientation: t.format.cadre.x > t.format.cadre.y ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [t.format.cadre.x * ratio, t.format.cadre.y * ratio],
    });

    const mirrorBase = t.warpQuantity * t.warpThickness;

    chainePdf.setDrawColor(0, 0, 0);
    chainePdf.setLineWidth(0.3);

    for (let y = 0; y < t.weftQuantity; y++) {
      for (let x = 0; x < t.warpQuantity; x++) {
        const cell = t.grid[y][x];
        if (!cell.isBlack) {
          const mx = mirrorBase - cell.position.x - t.warpThickness;
          const cy = cell.position.y + t.weftThickness / 2;
          chainePdf.line(
            (t.ancrage.x + mx) * ratio,
            (t.ancrage.y + cy) * ratio,
            (t.ancrage.x + mx + t.warpThickness) * ratio,
            (t.ancrage.y + cy) * ratio
          );
        }
      }
    }

    chainePdf.setDrawColor(120, 120, 120);
    chainePdf.setLineWidth(0.3);
    const ext = 1;

    for (let x = 0; x <= t.warpQuantity; x++) {
      const mx = mirrorBase - x * t.warpThickness;
      const cx = (t.ancrage.x + mx) * ratio;
      chainePdf.line(
        cx,
        (t.ancrage.y - ext) * ratio,
        cx,
        (t.ancrage.y + t.hauteurTissage + ext) * ratio
      );
    }

    chainePdf.setFontSize(6);
    chainePdf.setTextColor(120, 120, 120);
    const espacement = t.weftThickness + t.weftSpace;
    for (let y = 0; y < t.weftQuantity; y++) {
      chainePdf.text(
        String(y),
        (t.ancrage.x + mirrorBase + 0.3) * ratio,
        (t.ancrage.y + y * espacement + t.weftThickness * 0.8) * ratio
      );
    }

    chainePdf.setDrawColor(120, 120, 120);
    chainePdf.setLineWidth(0.5);
    chainePdf.rect(0, 0, t.format.cadre.x * ratio, t.format.cadre.y * ratio);

    chainePdf.setFontSize(6);
    chainePdf.setTextColor(120);
    chainePdf.text(
      t.getTimecode(),
      t.ancrage.x * ratio,
      (t.ancrage.y + t.hauteurTissage + ext + 0.5) * ratio
    );

    const chaineBlob = chainePdf.output('blob');
    downloadBlob(chaineBlob, `ChaineInverse-${t.id}.pdf`);
    await delay(500);

    // --- 3. Trame.pdf ---
    const trameH = t.weftQuantity * t.weftThickness * 2 + t.ancrage.y;
    const tramePdf = new jsPDF({
      orientation: t.format.cadre.x > trameH ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [t.format.cadre.x * ratio, trameH * ratio],
    });

    const margin = 0.1;

    for (let y = 0; y < t.weftQuantity; y++) {
      const rowY = t.ancrage.y + y * t.weftThickness * 2;

      let floatStart = -1;

      for (let x = 0; x < t.warpQuantity; x++) {
        const cell = t.grid[y][x];
        if (cell.isBlack) {
          if (floatStart === -1) floatStart = x;

          const next = x + 1 < t.warpQuantity ? t.grid[y][x + 1].isBlack : false;

          if (!next) {
            const startX = floatStart * t.warpThickness;
            const endX = (x + 1) * t.warpThickness;
            const isFloat = floatStart !== x;

            tramePdf.setFillColor(0, 0, 0);
            if (isFloat) {
              tramePdf.rect(
                (t.ancrage.x + startX - margin) * ratio,
                (rowY - margin) * ratio,
                (endX - startX + margin * 2) * ratio,
                (t.weftThickness + margin * 2) * ratio,
                'F'
              );
            } else {
              tramePdf.rect(
                (t.ancrage.x + startX) * ratio,
                rowY * ratio,
                t.warpThickness * ratio,
                t.weftThickness * ratio,
                'F'
              );
            }
            floatStart = -1;
          }
        } else {
          floatStart = -1;
        }
      }

      tramePdf.setDrawColor(120);
      tramePdf.setLineWidth(0.3);

      const repLeft = (t.ancrage.x - 1) * ratio;
      const repRight = (t.ancrage.x + t.largeurTissage + 0.3) * ratio;
      const bandTop = rowY * ratio;
      const bandBot = (rowY + t.weftThickness) * ratio;

      tramePdf.line(repLeft, bandTop, repLeft + 0.5 * ratio, bandTop);
      tramePdf.line(repLeft, bandBot, repLeft + 0.5 * ratio, bandBot);
      tramePdf.line(repLeft, bandTop, repLeft, bandBot);

      tramePdf.line(repRight, bandTop, repRight + 0.5 * ratio, bandTop);
      tramePdf.line(repRight, bandBot, repRight + 0.5 * ratio, bandBot);
      tramePdf.line(repRight + 0.5 * ratio, bandTop, repRight + 0.5 * ratio, bandBot);

      tramePdf.setFontSize(5);
      tramePdf.setTextColor(120);
      tramePdf.text(String(y), repRight + 0.7 * ratio, (rowY + t.weftThickness * 0.8) * ratio);
    }

    const trameBlob = tramePdf.output('blob');
    downloadBlob(trameBlob, `Trame-${t.id}.pdf`);
    await delay(500);

    // --- 4. Info.txt ---
    const infoBlob = new Blob([t.getInfoText()], { type: 'text/plain' });
    downloadBlob(infoBlob, `Info-${t.id}.txt`);
  }

  // --- Sauvegarde / Chargement JSON ---
  function saveJSON() {
    if (!tissage) return;
    const data = {
      version: '1.0',
      type: 'tissage',
      params: { formatKey, warpThickness, weftThickness, weftSpace, id: tissage.id },
      created: new Date().toISOString().split('T')[0],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pliio-tissage-${tissage.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.pliio';
    input.addEventListener('change', (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result);
          if (data.type !== 'tissage') {
            alert("Ce fichier n'est pas un patron de tissage Pliio.");
            return;
          }
          formatKey = data.params.formatKey ?? FORMAT_DEFAULT;
          warpThickness = data.params.warpThickness ?? 0.3;
          weftThickness = data.params.weftThickness ?? 0.3;
          weftSpace = data.params.weftSpace ?? 0.06;
          id = data.params.id ?? 0;
          buildTissage();
          applyCanvasSize();
          centerCanvas();
          render();
        } catch {
          alert('Fichier invalide.');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function copyShareURL() {
    if (!tissage) return;
    const params = new URLSearchParams({
      id: String(tissage.id),
      f: formatKey,
      wt: String(warpThickness),
      ft: String(weftThickness),
      ws: String(weftSpace),
    });
    const url = `${window.location.origin}/outils/tissage?${params}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Lien copié !');
    });
  }

  // --- Event handlers ---
  function handleKeydown(e) {
    if (e.key === 's' && !e.ctrlKey && !e.metaKey && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      exportAllPDF();
    }
    if (e.code === 'Space' && !e.repeat && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      spaceDown = true;
      if (canvasEl) canvasEl.style.cursor = 'grab';
    }
  }

  function handleKeyup(e) {
    if (e.code === 'Space') {
      spaceDown = false;
      isPanning = false;
      if (canvasEl) canvasEl.style.cursor = 'pointer';
    }
  }

  function handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    zoomAt(zoom + delta, e.clientX, e.clientY);
  }

  function handleAreaMousedown(e) {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button === 0 && e.target === canvasEl) {
      regenerate();
    }
  }

  function handleAreaMousemove(e) {
    if (isPanning) doPan(e.clientX, e.clientY);
  }

  function handleAreaMouseup(e) {
    if (isPanning) endPan();
  }

  // --- Lifecycle ---
  onMount(() => {
    // Charger depuis URL
    const params = new URLSearchParams(window.location.search);
    if (params.has('id')) id = Number(params.get('id'));
    if (params.has('f')) formatKey = params.get('f') ?? FORMAT_DEFAULT;
    if (params.has('wt')) warpThickness = Number(params.get('wt'));
    if (params.has('ft')) weftThickness = Number(params.get('ft'));
    if (params.has('ws')) weftSpace = Number(params.get('ws'));

    buildTissage();
    ctx = canvasEl.getContext('2d');
    computeBaseSize();
    applyCanvasSize();
    centerCanvas();
    render();

    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('keyup', handleKeyup);
    window.addEventListener('resize', () => { clampPan(); updateTransform(); });
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('keyup', handleKeyup);
    }
  });
</script>

<div class="tissage-app">
  <div class="controls">
    <div class="control-group">
      <h3>Format</h3>
      <select bind:value={formatKey} onchange={updateParams}>
        {#each formatEntries as [key, fmt]}
          <option value={key}>{fmt.nom} ({fmt.cadre.x}×{fmt.cadre.y} cm)</option>
        {/each}
      </select>
    </div>

    <div class="control-group">
      <h3>Paramètres de tissage</h3>
      <label>
        Épaisseur chaîne : {warpThickness.toFixed(2)} cm
        <input type="range" min="0.1" max="1.0" step="0.05" bind:value={warpThickness} oninput={updateParams} />
      </label>
      <label>
        Épaisseur trame : {weftThickness.toFixed(2)} cm
        <input type="range" min="0.1" max="1.0" step="0.05" bind:value={weftThickness} oninput={updateParams} />
      </label>
      <label>
        Espace inter-trame : {weftSpace.toFixed(2)} cm
        <input type="range" min="0.01" max="0.2" step="0.01" bind:value={weftSpace} oninput={updateParams} />
      </label>
    </div>

    <div class="control-group">
      <h3>Motif</h3>
      <div class="id-row">
        <label>
          ID :
          <input type="number" min="0" max="99999" bind:value={idInput}
            onkeydown={(e) => { if (e.key === 'Enter') applyId(); }} />
        </label>
        <button class="btn btn-small btn-outline" onclick={applyId}>OK</button>
      </div>
      <button class="btn btn-outline full-width" onclick={regenerate}>Nouveau motif</button>
    </div>

    <div class="control-group info-box">
      <p class="info-text">{infoText}</p>
      {#if tissage}
        <p class="info-sub">ID : {tissage.id}</p>
        <p class="info-sub">Horizon : {(tissage.horizon * 100).toFixed(0)}%</p>
      {/if}
    </div>

    <div class="control-group actions">
      <button class="btn btn-primary full-width" onclick={exportAllPDF}>Exporter PDF (s)</button>
      <button class="btn btn-outline full-width" onclick={saveJSON}>Sauvegarder .json</button>
      <button class="btn btn-outline full-width" onclick={loadJSON}>Charger .json</button>
      <button class="btn btn-outline full-width" onclick={copyShareURL}>Copier le lien</button>
    </div>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="canvas-area" bind:this={canvasArea}
    onmousedown={handleAreaMousedown}
    onmousemove={handleAreaMousemove}
    onmouseup={handleAreaMouseup}
    onwheel={handleWheel}>
    <div class="canvas-wrap" bind:this={canvasWrap}>
      <canvas bind:this={canvasEl}></canvas>
    </div>
    <div class="zoom-controls">
      <button class="zoom-btn" onclick={() => zoomCenter(-0.25)}>−</button>
      <span class="zoom-label">{Math.round(zoom * 100)}%</span>
      <button class="zoom-btn" onclick={() => zoomCenter(0.25)}>+</button>
      <button class="zoom-btn zoom-reset" onclick={resetZoom}>↺</button>
    </div>
    <p class="canvas-hint">Cliquez sur l'aperçu pour un nouveau motif</p>
  </div>
</div>

<style>
  .tissage-app {
    display: flex;
    gap: 0;
    height: calc(100vh - 6rem);
    min-height: 800px;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }

  .controls {
    width: 280px;
    min-width: 280px;
    background: #fff;
    border-right: 1px solid var(--border, #E0E0E0);
    padding: 1.25rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
  }

  .control-group {
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 6px;
    padding: 0.85rem;
    background: #fff;
  }

  .control-group h3 {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-soft, #555);
    margin-bottom: 0.6rem;
    font-family: var(--sans, system-ui, sans-serif);
    font-weight: 600;
  }

  label {
    display: block;
    font-size: 0.85rem;
    margin-bottom: 0.4rem;
    color: var(--text, #111);
  }

  input[type="range"] {
    width: 100%;
    margin-top: 0.2rem;
    accent-color: var(--blue, #1A5CFF);
  }

  input[type="number"] {
    width: 100px;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 3px;
    font-size: 0.9rem;
    font-family: monospace;
  }

  select {
    width: 100%;
    padding: 0.4rem;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 3px;
    font-size: 0.85rem;
    background: white;
  }

  .id-row {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .info-box {
    background: var(--bg-warm, #EFEFE6);
    border-color: transparent;
  }

  .info-text {
    font-size: 0.85rem;
    color: var(--text, #111);
    font-weight: 500;
  }

  .info-sub {
    font-size: 0.8rem;
    color: var(--text-soft, #555);
    margin-top: 0.2rem;
    font-family: monospace;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: auto;
  }

  .full-width {
    width: 100%;
    justify-content: center;
  }

  .canvas-area {
    flex: 1;
    overflow: hidden;
    position: relative;
    background: var(--bg-warm, #EFEFE6);
    height: 100%;
  }

  .canvas-wrap {
    position: absolute;
    background: #fff;
    border-radius: 4px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04);
    transform-origin: 0 0;
    will-change: transform;
    cursor: pointer;
  }

  .canvas-wrap canvas {
    display: block;
  }

  .canvas-hint {
    position: absolute;
    bottom: 44px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 0.72rem;
    letter-spacing: 0.05em;
    color: var(--text-soft, #555);
    text-transform: uppercase;
    pointer-events: none;
  }

  .zoom-controls {
    position: absolute;
    bottom: 12px;
    right: 12px;
    display: flex;
    gap: 4px;
    z-index: 10;
  }

  .zoom-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid var(--border, #E0E0E0);
    background: #fff;
    color: var(--text, #111);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .zoom-btn:hover {
    border-color: var(--blue, #1A5CFF);
    color: var(--blue, #1A5CFF);
  }

  .zoom-reset {
    font-size: 12px;
  }

  .zoom-label {
    font-family: monospace;
    font-size: 0.7rem;
    color: var(--text-soft, #555);
    align-self: center;
    min-width: 36px;
    text-align: center;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.2rem;
    border: 1.5px solid var(--text, #111);
    border-radius: 3px;
    font-family: var(--sans, system-ui, sans-serif);
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    background: transparent;
    color: var(--text, #111);
  }

  .btn-small {
    padding: 0.35rem 0.7rem;
    font-size: 0.72rem;
  }

  .btn-primary {
    background: var(--text, #111);
    color: #fff;
    border-color: var(--text, #111);
  }

  .btn-primary:hover {
    background: var(--blue, #1A5CFF);
    border-color: var(--blue, #1A5CFF);
    color: #fff;
  }

  .btn-outline {
    background: transparent;
    border: 1.5px solid var(--border, #E0E0E0);
    color: var(--text, #111);
  }

  .btn-outline:hover {
    border-color: var(--blue, #1A5CFF);
    color: var(--blue, #1A5CFF);
  }

  @media (max-width: 860px) {
    .tissage-app {
      flex-direction: column;
      height: auto;
      min-height: auto;
    }

    .controls {
      width: 100%;
      min-width: unset;
      border-right: none;
      border-bottom: 1px solid var(--border, #E0E0E0);
    }

    .canvas-area {
      flex: none;
      height: 800px;
    }
  }
</style>
