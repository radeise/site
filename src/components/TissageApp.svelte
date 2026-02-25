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

  // Canvas
  const DPR = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const BASE_SCALE = 0.5;

  let canvasEl;
  let canvasArea;
  let ctx;

  let baseW = $state(400);
  let baseH = $state(600);
  let displayW = $state(400);
  let displayH = $state(600);

  let showOptions = $state(false);

  function computeBaseSize() {
    const fmt = FORMATS[formatKey];
    baseW = Math.round(px(fmt.cadre.x) * BASE_SCALE);
    baseH = Math.round(px(fmt.cadre.y) * BASE_SCALE);
  }

  // --- Canvas size (fit to container, maintain aspect ratio) ---
  function applyCanvasSize() {
    if (!canvasEl || !ctx) return;
    computeBaseSize();
    if (canvasArea) {
      const available = canvasArea.clientWidth - 32;
      const scale = Math.min(1, available / baseW);
      displayW = Math.round(baseW * scale);
      displayH = Math.round(baseH * scale);
    } else {
      displayW = baseW;
      displayH = baseH;
    }
    canvasEl.width = Math.round(baseW * DPR);
    canvasEl.height = Math.round(baseH * DPR);
    canvasEl.style.width = displayW + 'px';
    canvasEl.style.height = displayH + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
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
  }

  function handleResize() {
    applyCanvasSize();
    render();
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
    applyCanvasSize();
    render();

    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', handleResize);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('resize', handleResize);
    }
  });
</script>

<div class="simple-app">
  <div class="canvas-area" bind:this={canvasArea}>
    <canvas bind:this={canvasEl}></canvas>
  </div>

  <div class="action-bar">
    <button class="btn btn-primary" onclick={regenerate}>Générer</button>
    <button class="btn btn-primary" onclick={exportAllPDF}>Exporter PDF</button>
  </div>

  <button class="toggle-options" onclick={() => { showOptions = !showOptions }}>
    <span class="toggle-arrow" class:open={showOptions}>&#9654;</span>
    Personnaliser
  </button>

  {#if showOptions}
    <div class="options-panel">
      <div class="opt-row">
        <div class="opt-group">
          <h3>Format</h3>
          <select bind:value={formatKey} onchange={updateParams}>
            {#each formatEntries as [key, fmt]}
              <option value={key}>{fmt.nom} ({fmt.cadre.x}×{fmt.cadre.y} cm)</option>
            {/each}
          </select>
        </div>

        <div class="opt-group">
          <h3>Épaisseur</h3>
          <label>
            Chaîne : {warpThickness.toFixed(2)} cm
            <input type="range" min="0.1" max="1.0" step="0.05" bind:value={warpThickness} oninput={updateParams} />
          </label>
          <label>
            Trame : {weftThickness.toFixed(2)} cm
            <input type="range" min="0.1" max="1.0" step="0.05" bind:value={weftThickness} oninput={updateParams} />
          </label>
          <label>
            Espace : {weftSpace.toFixed(2)} cm
            <input type="range" min="0.01" max="0.2" step="0.01" bind:value={weftSpace} oninput={updateParams} />
          </label>
        </div>

        <div class="opt-group">
          <h3>Motif</h3>
          <div class="id-row">
            <label>
              ID :
              <input type="number" min="0" max="99999" bind:value={idInput}
                onkeydown={(e) => { if (e.key === 'Enter') applyId(); }} />
            </label>
            <button class="btn btn-small btn-outline" onclick={applyId}>OK</button>
          </div>
        </div>
      </div>

      <div class="opt-row">
        <div class="opt-group info-box">
          <p class="info-text">{infoText}</p>
          {#if tissage}
            <p class="info-sub">ID : {tissage.id}</p>
            <p class="info-sub">Horizon : {(tissage.horizon * 100).toFixed(0)}%</p>
          {/if}
        </div>

        <div class="opt-group">
          <h3>Fichiers</h3>
          <div class="file-btns">
            <button class="btn btn-outline full-width" onclick={saveJSON}>Sauvegarder .json</button>
            <button class="btn btn-outline full-width" onclick={loadJSON}>Charger .json</button>
            <button class="btn btn-outline full-width" onclick={copyShareURL}>Copier le lien</button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .simple-app {
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }

  .canvas-area {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 2rem;
    background: var(--bg-warm, #EFEFE6);
  }

  .canvas-area canvas {
    display: block;
    border-radius: 4px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04);
  }

  /* --- Action bar --- */
  .action-bar {
    display: flex;
    justify-content: center;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    border-top: 1px solid var(--border, #E0E0E0);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 2rem;
    border: 1.5px solid var(--text, #111);
    border-radius: 3px;
    font-family: var(--sans, system-ui, sans-serif);
    font-size: 0.82rem;
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
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(26, 92, 255, 0.2);
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

  /* --- Toggle options --- */
  .toggle-options {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.8rem 1.5rem;
    background: none;
    border: none;
    border-top: 1px solid var(--border, #E0E0E0);
    cursor: pointer;
    font-family: var(--sans, system-ui, sans-serif);
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-soft, #555);
    transition: color 0.2s;
  }

  .toggle-options:hover {
    color: var(--text, #111);
  }

  .toggle-arrow {
    font-size: 0.6rem;
    transition: transform 0.25s ease;
    display: inline-block;
  }

  .toggle-arrow.open {
    transform: rotate(90deg);
  }

  /* --- Options panel --- */
  .options-panel {
    padding: 1.25rem 1.5rem 1.5rem;
    border-top: 1px solid var(--border, #E0E0E0);
    background: var(--bg-warm, #EFEFE6);
  }

  .opt-row {
    display: flex;
    gap: 2rem;
    margin-bottom: 1.25rem;
  }

  .opt-row:last-child {
    margin-bottom: 0;
  }

  .opt-group {
    flex: 1;
    min-width: 0;
  }

  .opt-group h3 {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--text-soft, #555);
    margin-bottom: 0.6rem;
    font-family: var(--sans, system-ui, sans-serif);
    font-weight: 600;
  }

  .id-row {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
  }

  .info-box {
    background: #fff;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 6px;
    padding: 0.85rem;
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

  .file-btns {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .full-width {
    width: 100%;
    justify-content: center;
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
    background: #fff;
  }

  select {
    width: 100%;
    padding: 0.4rem;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 3px;
    font-size: 0.85rem;
    background: white;
  }

  @media (max-width: 860px) {
    .canvas-area {
      padding: 1rem;
    }

    .opt-row {
      flex-direction: column;
      gap: 1rem;
    }

    .action-bar {
      padding: 1rem;
    }

    .btn {
      padding: 0.7rem 1.5rem;
      font-size: 0.78rem;
    }
  }
</style>
