<script>
  import { onMount, onDestroy } from 'svelte';
  import { Tissage } from '../lib/tissage.js';
  import { FORMATS, FORMAT_DEFAULT, RATIO, px } from '../lib/formats.js';

  // --- State ---
  let canvasContainer;
  let p5Instance = null;
  let tissage = $state(null);

  // Paramètres utilisateur
  let formatKey = $state(FORMAT_DEFAULT);
  let warpThickness = $state(0.3);
  let weftThickness = $state(0.3);
  let weftSpace = $state(0.06);
  let id = $state(Math.floor(Math.random() * 100000));
  let idInput = $state('');

  // Échelle d'affichage (le canvas est réduit pour tenir à l'écran)
  const ratioScale = 0.5;

  // Infos dérivées
  let infoText = $derived(tissage ? `${tissage.warpQuantity} chaînes × ${tissage.weftQuantity} trames — ${tissage.largeurTissage.toFixed(1)} × ${tissage.hauteurTissage.toFixed(1)} cm` : '');

  // Formats pour le sélecteur
  const formatEntries = Object.entries(FORMATS);

  // --- Initialisation ---
  function buildTissage() {
    tissage = new Tissage({ formatKey, warpThickness, weftThickness, weftSpace, id });
    idInput = String(tissage.id);
  }

  // --- Rendu p5.js ---
  function createSketch(p) {
    p.setup = function () {
      const fmt = FORMATS[formatKey];
      const w = px(fmt.cadre.x) * ratioScale;
      const h = px(fmt.cadre.y) * ratioScale;
      p.createCanvas(w, h);
      p.noLoop();
    };

    p.draw = function () {
      if (!tissage) return;

      const s = ratioScale;
      const fmt = tissage.format;
      const cW = px(fmt.cadre.x) * s;
      const cH = px(fmt.cadre.y) * s;

      p.background(255);

      const ancX = px(tissage.ancrage.x) * s;
      const ancY = px(tissage.ancrage.y) * s;

      // --- Dessiner les cellules noires (trame au-dessus) ---
      p.noStroke();
      p.fill(0);

      for (let y = 0; y < tissage.weftQuantity; y++) {
        for (let x = 0; x < tissage.warpQuantity; x++) {
          const cell = tissage.grid[y][x];
          if (cell.isBlack) {
            p.rect(
              ancX + px(cell.position.x) * s,
              ancY + px(cell.position.y) * s,
              px(tissage.warpThickness) * s,
              px(tissage.weftThickness) * s
            );
          }
        }
      }

      // --- Dessiner les fils de chaîne (lignes verticales grises) ---
      p.stroke(120);
      p.strokeWeight(0.5);
      p.noFill();

      const topExtension = px(1) * s;   // 1 cm de dépassement
      const warpW = px(tissage.warpThickness) * s;
      const totalH = px(tissage.hauteurTissage) * s;

      // Première colonne : segments uniquement sur les cellules noires
      for (let y = 0; y < tissage.weftQuantity; y++) {
        const cell = tissage.grid[y][0];
        if (cell.isBlack) {
          const cy = ancY + px(cell.position.y) * s;
          const segTop = (y === 0) ? cy - topExtension : cy;
          const segBot = (y === tissage.weftQuantity - 1) ? cy + px(tissage.weftThickness) * s + topExtension : cy + px(tissage.weftThickness) * s;
          p.line(ancX, segTop, ancX, segBot);
        }
      }

      // Colonnes intermédiaires : ligne continue
      for (let x = 1; x < tissage.warpQuantity; x++) {
        const cx = ancX + px(x * tissage.warpThickness) * s;
        p.line(cx, ancY - topExtension, cx, ancY + totalH + topExtension);
      }

      // Dernière colonne : segments sur cellules noires
      const lastX = ancX + px(tissage.warpQuantity * tissage.warpThickness) * s;
      for (let y = 0; y < tissage.weftQuantity; y++) {
        const cell = tissage.grid[y][tissage.warpQuantity - 1];
        if (cell.isBlack) {
          const cy = ancY + px(cell.position.y) * s;
          const segTop = (y === 0) ? cy - topExtension : cy;
          const segBot = (y === tissage.weftQuantity - 1) ? cy + px(tissage.weftThickness) * s + topExtension : cy + px(tissage.weftThickness) * s;
          p.line(lastX, segTop, lastX, segBot);
        }
      }

      // --- Cadre ---
      p.stroke(120);
      p.strokeWeight(0.5);
      p.noFill();
      p.rect(0, 0, cW - 1, cH - 1);

      // --- Timecode ---
      p.fill(120);
      p.noStroke();
      p.textSize(8);
      p.textAlign(p.LEFT, p.TOP);
      p.text(tissage.getTimecode(), ancX, ancY + totalH + topExtension + 4);
    };

    p.mousePressed = function () {
      // Clic sur le canvas → nouveau motif
      if (p.mouseX >= 0 && p.mouseX <= p.width && p.mouseY >= 0 && p.mouseY <= p.height) {
        regenerate();
      }
    };
  }

  // --- Actions ---
  function regenerate() {
    id = Math.floor(Math.random() * 100000);
    buildTissage();
    redraw();
  }

  function applyId() {
    const parsed = parseInt(idInput, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 99999) {
      id = parsed;
      buildTissage();
      redraw();
    }
  }

  function redraw() {
    if (p5Instance && tissage) {
      const fmt = tissage.format;
      const w = px(fmt.cadre.x) * ratioScale;
      const h = px(fmt.cadre.y) * ratioScale;
      p5Instance.resizeCanvas(w, h);
      p5Instance.redraw();
    }
  }

  function updateParams() {
    buildTissage();
    redraw();
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
      params: {
        formatKey,
        warpThickness,
        weftThickness,
        weftSpace,
        id: tissage.id,
      },
      created: new Date().toISOString().split('T')[0],
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pixtil-tissage-${tissage.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.pixtil';
    input.addEventListener('change', (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result);
          if (data.type !== 'tissage') {
            alert("Ce fichier n'est pas un patron de tissage Pixtil.");
            return;
          }
          formatKey = data.params.formatKey ?? FORMAT_DEFAULT;
          warpThickness = data.params.warpThickness ?? 0.3;
          weftThickness = data.params.weftThickness ?? 0.3;
          weftSpace = data.params.weftSpace ?? 0.06;
          id = data.params.id ?? 0;
          buildTissage();
          redraw();
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

  // --- Raccourci clavier ---
  function handleKeydown(e) {
    if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      exportAllPDF();
    }
  }

  // --- Lifecycle ---
  onMount(async () => {
    // Charger depuis URL
    const params = new URLSearchParams(window.location.search);
    if (params.has('id')) id = Number(params.get('id'));
    if (params.has('f')) formatKey = params.get('f') ?? FORMAT_DEFAULT;
    if (params.has('wt')) warpThickness = Number(params.get('wt'));
    if (params.has('ft')) weftThickness = Number(params.get('ft'));
    if (params.has('ws')) weftSpace = Number(params.get('ws'));

    buildTissage();

    const p5Module = await import('p5');
    const P5 = p5Module.default;
    p5Instance = new P5(createSketch, canvasContainer);

    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    if (p5Instance) {
      p5Instance.remove();
      p5Instance = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeydown);
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

  <div class="preview">
    <div class="canvas-wrapper" bind:this={canvasContainer}></div>
    <p class="canvas-hint">Cliquez sur l'aperçu pour un nouveau motif</p>
  </div>
</div>

<style>
  .tissage-app {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 2rem;
    align-items: start;
  }

  @media (max-width: 860px) {
    .tissage-app {
      grid-template-columns: 1fr;
    }
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .control-group {
    border: 1px solid var(--color-border, #e5e0da);
    border-radius: 8px;
    padding: 0.85rem;
  }

  .control-group h3 {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b6b6b;
    margin-bottom: 0.6rem;
    font-family: system-ui, sans-serif;
    font-weight: 600;
  }

  label {
    display: block;
    font-size: 0.85rem;
    margin-bottom: 0.4rem;
    color: #2a2a2a;
  }

  input[type="range"] {
    width: 100%;
    margin-top: 0.2rem;
  }

  input[type="number"] {
    width: 100px;
    padding: 0.35rem 0.5rem;
    border: 1px solid #e5e0da;
    border-radius: 4px;
    font-size: 0.9rem;
    font-family: monospace;
  }

  select {
    width: 100%;
    padding: 0.4rem;
    border: 1px solid #e5e0da;
    border-radius: 4px;
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
    background: #faf8f5;
  }

  .info-text {
    font-size: 0.85rem;
    color: #2a2a2a;
    font-weight: 500;
  }

  .info-sub {
    font-size: 0.8rem;
    color: #6b6b6b;
    margin-top: 0.2rem;
    font-family: monospace;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .full-width {
    width: 100%;
    justify-content: center;
  }

  .preview {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .canvas-wrapper {
    border: 1px solid #e5e0da;
    border-radius: 4px;
    overflow: auto;
    background: white;
    max-width: 100%;
  }

  .canvas-hint {
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: #999;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-small {
    padding: 0.35rem 0.7rem;
    font-size: 0.8rem;
  }

  .btn-primary {
    background: #c4956a;
    color: white;
  }

  .btn-primary:hover {
    background: #a67a52;
  }

  .btn-outline {
    background: transparent;
    border: 1.5px solid #e5e0da;
    color: #2a2a2a;
  }

  .btn-outline:hover {
    border-color: #c4956a;
    color: #a67a52;
  }
</style>
