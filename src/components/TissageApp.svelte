<script>
  import { onMount, onDestroy } from 'svelte';

  // --- State ---
  let canvasContainer;
  let p5Instance = null;

  // Weaving parameters
  let cols = $state(10);
  let rows = $state(14);
  let stripWidth = $state(20);
  let pattern = $state('plain');
  let color1 = $state('#2a4858');
  let color2 = $state('#d4a574');
  let color3 = $state('#f0e6d3');
  let seed = $state(Math.floor(Math.random() * 100000));
  let density = $state(0.5);

  // Derived
  let canvasWidth = $derived(cols * stripWidth + 60);
  let canvasHeight = $derived(rows * stripWidth + 60);

  // --- Weaving pattern generators ---
  function generatePlainWeave(c, r) {
    return (c + r) % 2 === 0;
  }

  function generateTwillWeave(c, r) {
    return (c + r) % 4 < 2;
  }

  function generateSatinWeave(c, r, rng) {
    const shift = Math.floor(rng() * 3) + 1;
    return (c + r * shift) % 5 === 0;
  }

  function generateRandomWeave(c, r, rng) {
    return rng() < density;
  }

  // Simple seeded random
  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function getWeaveFunction() {
    switch (pattern) {
      case 'twill': return generateTwillWeave;
      case 'satin': return generateSatinWeave;
      case 'random': return generateRandomWeave;
      default: return generatePlainWeave;
    }
  }

  // --- p5.js Sketch ---
  function createSketch(p) {
    p.setup = function() {
      p.createCanvas(canvasWidth, canvasHeight);
      p.noLoop();
    };

    p.draw = function() {
      const rng = mulberry32(seed);
      const weaveFn = getWeaveFunction();
      const margin = 30;

      p.background(255);

      // Draw weaving grid
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = margin + c * stripWidth;
          const y = margin + r * stripWidth;
          const isWarp = weaveFn(c, r, rng);

          // Pick color based on position and seed
          const colorRng = mulberry32(seed + c * 100 + r);
          const colorChoice = colorRng();

          if (isWarp) {
            // Vertical strip on top
            if (colorChoice < 0.33) p.fill(color1);
            else if (colorChoice < 0.66) p.fill(color2);
            else p.fill(color3);
          } else {
            // Horizontal strip on top
            if (colorChoice < 0.5) p.fill(color2);
            else p.fill(color3);
          }

          p.noStroke();
          p.rect(x, y, stripWidth, stripWidth);

          // Grid lines
          p.stroke(200);
          p.strokeWeight(0.5);
          p.noFill();
          p.rect(x, y, stripWidth, stripWidth);
        }
      }

      // Draw cut marks
      p.stroke(100);
      p.strokeWeight(0.3);

      // Top/bottom marks
      for (let c = 0; c <= cols; c++) {
        const x = margin + c * stripWidth;
        p.line(x, margin - 8, x, margin - 2);
        p.line(x, margin + rows * stripWidth + 2, x, margin + rows * stripWidth + 8);
      }

      // Left/right marks
      for (let r = 0; r <= rows; r++) {
        const y = margin + r * stripWidth;
        p.line(margin - 8, y, margin - 2, y);
        p.line(margin + cols * stripWidth + 2, y, margin + cols * stripWidth + 8, y);
      }
    };
  }

  // --- Lifecycle ---
  onMount(async () => {
    const p5Module = await import('p5');
    const P5 = p5Module.default;
    p5Instance = new P5(createSketch, canvasContainer);
  });

  onDestroy(() => {
    if (p5Instance) {
      p5Instance.remove();
      p5Instance = null;
    }
  });

  // --- Reactivity: redraw on parameter change ---
  $effect(() => {
    // Access all reactive params to track them
    cols; rows; stripWidth; pattern; color1; color2; color3; seed; density;

    if (p5Instance) {
      p5Instance.resizeCanvas(canvasWidth, canvasHeight);
      p5Instance.redraw();
    }
  });

  // --- Actions ---
  function randomize() {
    seed = Math.floor(Math.random() * 100000);
  }

  function exportPDF() {
    if (!p5Instance) return;

    import('jspdf').then(({ jsPDF }) => {
      const pdf = new jsPDF({
        orientation: canvasWidth > canvasHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvasWidth * 2, canvasHeight * 2],
      });

      // Get canvas data as image
      const canvas = canvasContainer.querySelector('canvas');
      if (canvas) {
        const imgData = canvas.toDataURL('image/png', 1.0);
        pdf.addImage(imgData, 'PNG', 0, 0, canvasWidth * 2, canvasHeight * 2);
        pdf.save(`pixtil-tissage-${seed}.pdf`);
      }
    });
  }

  function exportSVG() {
    const rng = mulberry32(seed);
    const weaveFn = getWeaveFunction();
    const margin = 30;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">`;
    svg += `<rect width="${canvasWidth}" height="${canvasHeight}" fill="white"/>`;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = margin + c * stripWidth;
        const y = margin + r * stripWidth;
        const isWarp = weaveFn(c, r, rng);

        const colorRng = mulberry32(seed + c * 100 + r);
        const colorChoice = colorRng();

        let fill;
        if (isWarp) {
          if (colorChoice < 0.33) fill = color1;
          else if (colorChoice < 0.66) fill = color2;
          else fill = color3;
        } else {
          if (colorChoice < 0.5) fill = color2;
          else fill = color3;
        }

        svg += `<rect x="${x}" y="${y}" width="${stripWidth}" height="${stripWidth}" fill="${fill}" stroke="#c8c8c8" stroke-width="0.5"/>`;
      }
    }

    // Cut marks
    for (let c = 0; c <= cols; c++) {
      const x = margin + c * stripWidth;
      svg += `<line x1="${x}" y1="${margin - 8}" x2="${x}" y2="${margin - 2}" stroke="#666" stroke-width="0.3"/>`;
      svg += `<line x1="${x}" y1="${margin + rows * stripWidth + 2}" x2="${x}" y2="${margin + rows * stripWidth + 8}" stroke="#666" stroke-width="0.3"/>`;
    }
    for (let r = 0; r <= rows; r++) {
      const y = margin + r * stripWidth;
      svg += `<line x1="${margin - 8}" y1="${y}" x2="${margin - 2}" y2="${y}" stroke="#666" stroke-width="0.3"/>`;
      svg += `<line x1="${margin + cols * stripWidth + 2}" y1="${y}" x2="${margin + cols * stripWidth + 8}" y2="${y}" stroke="#666" stroke-width="0.3"/>`;
    }

    svg += '</svg>';

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pixtil-tissage-${seed}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function saveJSON() {
    const data = {
      version: '1.0',
      type: 'tissage',
      params: {
        cols, rows, stripWidth, pattern,
        couleurs: [color1, color2, color3],
        density, seed,
      },
      created: new Date().toISOString().split('T')[0],
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pixtil-tissage-${seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.pixtil';
    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.type !== 'tissage') {
            alert('Ce fichier n\'est pas un patron de tissage Pixtil.');
            return;
          }
          cols = data.params.cols;
          rows = data.params.rows;
          stripWidth = data.params.stripWidth;
          pattern = data.params.pattern;
          color1 = data.params.couleurs[0];
          color2 = data.params.couleurs[1];
          color3 = data.params.couleurs[2];
          density = data.params.density;
          seed = data.params.seed;
        } catch {
          alert('Fichier invalide.');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function copyShareURL() {
    const params = new URLSearchParams({
      seed: String(seed),
      c: String(cols),
      r: String(rows),
      sw: String(stripWidth),
      m: pattern,
      c1: color1.replace('#', ''),
      c2: color2.replace('#', ''),
      c3: color3.replace('#', ''),
      d: String(density),
    });
    const url = `${window.location.origin}/outils/tissage?${params}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Lien copié !');
    });
  }

  // Load from URL params on mount
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('seed')) seed = Number(params.get('seed'));
    if (params.has('c')) cols = Number(params.get('c'));
    if (params.has('r')) rows = Number(params.get('r'));
    if (params.has('sw')) stripWidth = Number(params.get('sw'));
    if (params.has('m')) pattern = params.get('m') || 'plain';
    if (params.has('c1')) color1 = '#' + params.get('c1');
    if (params.has('c2')) color2 = '#' + params.get('c2');
    if (params.has('c3')) color3 = '#' + params.get('c3');
    if (params.has('d')) density = Number(params.get('d'));
  });
</script>

<div class="tissage-app">
  <div class="controls">
    <div class="control-group">
      <h3>Dimensions</h3>
      <label>
        Colonnes : {cols}
        <input type="range" min="4" max="24" bind:value={cols} />
      </label>
      <label>
        Lignes : {rows}
        <input type="range" min="4" max="30" bind:value={rows} />
      </label>
      <label>
        Largeur bande : {stripWidth}px
        <input type="range" min="10" max="40" bind:value={stripWidth} />
      </label>
    </div>

    <div class="control-group">
      <h3>Motif</h3>
      <select bind:value={pattern}>
        <option value="plain">Toile (plain)</option>
        <option value="twill">Sergé (twill)</option>
        <option value="satin">Satin</option>
        <option value="random">Aléatoire</option>
      </select>

      {#if pattern === 'random'}
        <label>
          Densité : {density.toFixed(2)}
          <input type="range" min="0.1" max="0.9" step="0.05" bind:value={density} />
        </label>
      {/if}
    </div>

    <div class="control-group">
      <h3>Couleurs</h3>
      <div class="color-row">
        <label>
          <input type="color" bind:value={color1} />
          Couleur 1
        </label>
        <label>
          <input type="color" bind:value={color2} />
          Couleur 2
        </label>
        <label>
          <input type="color" bind:value={color3} />
          Couleur 3
        </label>
      </div>
    </div>

    <div class="control-group">
      <h3>Graine : {seed}</h3>
      <button class="btn btn-outline" onclick={randomize}>Nouveau motif</button>
    </div>

    <div class="control-group actions">
      <button class="btn btn-primary" onclick={exportPDF}>Exporter PDF</button>
      <button class="btn btn-outline" onclick={exportSVG}>Exporter SVG</button>
      <button class="btn btn-outline" onclick={saveJSON}>Sauvegarder</button>
      <button class="btn btn-outline" onclick={loadJSON}>Charger</button>
      <button class="btn btn-outline" onclick={copyShareURL}>Partager le lien</button>
    </div>
  </div>

  <div class="preview">
    <div class="canvas-wrapper" bind:this={canvasContainer}></div>
  </div>
</div>

<style>
  .tissage-app {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 2rem;
    align-items: start;
  }

  @media (max-width: 768px) {
    .tissage-app {
      grid-template-columns: 1fr;
    }
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .control-group {
    border: 1px solid var(--color-border, #e5e0da);
    border-radius: 8px;
    padding: 1rem;
  }

  .control-group h3 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b6b6b;
    margin-bottom: 0.75rem;
    font-family: system-ui, sans-serif;
    font-weight: 600;
  }

  label {
    display: block;
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
    color: #2a2a2a;
  }

  input[type="range"] {
    width: 100%;
    margin-top: 0.25rem;
  }

  select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #e5e0da;
    border-radius: 4px;
    font-size: 0.9rem;
    background: white;
  }

  .color-row {
    display: flex;
    gap: 0.5rem;
  }

  .color-row label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8rem;
  }

  input[type="color"] {
    width: 32px;
    height: 32px;
    border: 1px solid #e5e0da;
    border-radius: 4px;
    cursor: pointer;
    padding: 2px;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .actions .btn {
    width: 100%;
    justify-content: center;
  }

  .preview {
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }

  .canvas-wrapper {
    border: 1px solid #e5e0da;
    border-radius: 8px;
    overflow: hidden;
    background: white;
  }

  /* Button styles duplicated for component scope */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
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
