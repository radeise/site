<script>
  import { onMount, onDestroy } from 'svelte';

  // --- Constants ---
  const SQUARE = 520; // canvas size in logical px
  const DPR = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

  const DEFAULT_COLORS = ['#E63024', '#1A5CFF', '#FFD000', '#2ab54e'];
  const DEFAULT_NUMBERS = ['1','2','3','4','5','6','7','8'];
  const DEFAULT_MESSAGES = [
    'Tu vas vivre une belle aventure',
    'Un ami te réserve une surprise',
    'Tu trouveras un trésor caché',
    'Quelqu\'un pense fort à toi',
    'Une bonne nouvelle arrive bientôt',
    'Tu vas éclater de rire aujourd\'hui',
    'Un voyage se prépare pour toi',
    'Ta journée sera extraordinaire',
  ];

  // --- State ---
  let colors = $state([...DEFAULT_COLORS]);
  let numbers = $state([...DEFAULT_NUMBERS]);
  let messages = $state([...DEFAULT_MESSAGES]);
  let showFold = $state(true);
  let showNumbers = $state(true);
  let fontScale = $state(1);
  let seed = $state(Math.floor(Math.random() * 100000));
  let patternStyle = $state('dots');

  const patternOptions = [
    { value: 'dots', label: 'Points' },
    { value: 'lines', label: 'Lignes' },
    { value: 'circles', label: 'Cercles' },
    { value: 'crosses', label: 'Croix' },
    { value: 'none', label: 'Aucun' },
  ];

  // Zoom / Pan
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let spaceDown = false;
  let isPanning = false;
  let panMX = 0, panMY = 0, panSX = 0, panSY = 0;

  // DOM refs
  let canvasEl;
  let canvasWrap;
  let canvasArea;
  let ctx;

  // --- Seeded random ---
  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // --- Canvas size & transform ---
  function applyCanvasSize() {
    if (!canvasEl || !ctx) return;
    const s = SQUARE * zoom;
    canvasEl.width = Math.round(s * DPR);
    canvasEl.height = Math.round(s * DPR);
    canvasEl.style.width = Math.round(s) + 'px';
    canvasEl.style.height = Math.round(s) + 'px';
    ctx.setTransform(s * DPR / SQUARE, 0, 0, s * DPR / SQUARE, 0, 0);
  }

  function updateTransform() {
    if (!canvasWrap) return;
    canvasWrap.style.transform = `translate(${panX}px,${panY}px)`;
  }

  function centerCanvas() {
    if (!canvasArea) return;
    const ar = canvasArea.getBoundingClientRect();
    const s = SQUARE * zoom;
    panX = Math.max(0, (ar.width - s) / 2);
    panY = Math.max(0, (ar.height - s) / 2);
    updateTransform();
  }

  function clampPan() {
    if (!canvasArea) return;
    const ar = canvasArea.getBoundingClientRect();
    const s = SQUARE * zoom;
    const minX = Math.min(0, ar.width - s - 20);
    const maxX = Math.max(ar.width - s, 20);
    const minY = Math.min(0, ar.height - s - 20);
    const maxY = Math.max(ar.height - s, 20);
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
    if (canvasEl) canvasEl.style.cursor = spaceDown ? 'grab' : 'default';
  }

  // --- Drawing helpers ---
  function drawPattern(rng, cx, cy, radius, color, style) {
    if (style === 'none') return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    const a = parseColor(color);
    const light = `rgba(${a[0]},${a[1]},${a[2]},0.15)`;
    const med = `rgba(${a[0]},${a[1]},${a[2]},0.25)`;

    if (style === 'dots') {
      const step = 16;
      for (let x = cx - radius; x < cx + radius; x += step) {
        for (let y = cy - radius; y < cy + radius; y += step) {
          const ox = x + (rng() - 0.5) * 6;
          const oy = y + (rng() - 0.5) * 6;
          const r = 1.5 + rng() * 2.5;
          ctx.fillStyle = rng() > 0.5 ? light : med;
          ctx.beginPath();
          ctx.arc(ox, oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (style === 'lines') {
      ctx.strokeStyle = light;
      ctx.lineWidth = 1;
      const step = 8;
      const angle = rng() * Math.PI;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (let i = -radius * 2; i < radius * 2; i += step) {
        const x1 = cx + cos * i - sin * radius * 2;
        const y1 = cy + sin * i + cos * radius * 2;
        const x2 = cx + cos * i + sin * radius * 2;
        const y2 = cy + sin * i - cos * radius * 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    } else if (style === 'circles') {
      const count = 5 + Math.floor(rng() * 8);
      for (let i = 0; i < count; i++) {
        const ox = cx + (rng() - 0.5) * radius * 1.2;
        const oy = cy + (rng() - 0.5) * radius * 1.2;
        const r = 8 + rng() * radius * 0.4;
        ctx.strokeStyle = rng() > 0.5 ? light : med;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (style === 'crosses') {
      const step = 20;
      const size = 4;
      for (let x = cx - radius; x < cx + radius; x += step) {
        for (let y = cy - radius; y < cy + radius; y += step) {
          const ox = x + (rng() - 0.5) * 8;
          const oy = y + (rng() - 0.5) * 8;
          ctx.strokeStyle = rng() > 0.5 ? light : med;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ox - size, oy); ctx.lineTo(ox + size, oy);
          ctx.moveTo(ox, oy - size); ctx.lineTo(ox, oy + size);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function parseColor(hex) {
    if (hex.startsWith('#')) {
      const v = parseInt(hex.slice(1), 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    return [100, 100, 100];
  }

  function wrapText(text, maxWidth, fs) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    ctx.font = `${fs}px "Instrument Sans", system-ui, sans-serif`;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // --- Main render ---
  function render() {
    if (!ctx) return;
    const rng = mulberry32(seed);
    const S = SQUARE;
    const half = S / 2;
    const pad = 12;

    ctx.clearRect(0, 0, S, S);

    // White background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, S, S);

    // 8 triangles: 4 outer (color), 4 inner (messages)
    // Layout: square divided into 4 quadrants, each quadrant has 2 triangles
    // Outer triangles point to edges, inner triangles point to center

    const quadrants = [
      { ox: 0, oy: 0, ci: 0 },      // top-left
      { ox: half, oy: 0, ci: 1 },    // top-right
      { ox: 0, oy: half, ci: 2 },    // bottom-left
      { ox: half, oy: half, ci: 3 }, // bottom-right
    ];

    // Each quadrant: square from (ox,oy) to (ox+half, oy+half)
    // Diagonal from corner to center divides it into outer triangle and inner triangle
    // Outer triangle: the one touching the outer edge
    // Inner triangle: the one touching the center

    for (let q = 0; q < 4; q++) {
      const { ox, oy, ci } = quadrants[q];
      const col = colors[ci];

      // Corners of the quadrant
      const outerCorner = [ox + (q % 2 === 0 ? 0 : half), oy + (q < 2 ? 0 : half)];
      const centerCorner = [ox + (q % 2 === 0 ? half : 0), oy + (q < 2 ? half : 0)];
      const adj1 = [ox + (q % 2 === 0 ? half : 0), oy + (q < 2 ? 0 : half)];
      const adj2 = [ox + (q % 2 === 0 ? 0 : half), oy + (q < 2 ? half : 0)];

      // Outer triangle: outerCorner, adj1, adj2
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(outerCorner[0], outerCorner[1]);
      ctx.lineTo(adj1[0], adj1[1]);
      ctx.lineTo(adj2[0], adj2[1]);
      ctx.closePath();
      ctx.fill();

      // Pattern on outer triangle
      const ocx = (outerCorner[0] + adj1[0] + adj2[0]) / 3;
      const ocy = (outerCorner[1] + adj1[1] + adj2[1]) / 3;
      drawPattern(rng, ocx, ocy, half * 0.38, col, patternStyle);

      // Number on outer triangle
      if (showNumbers) {
        const ni1 = q * 2;
        const ni2 = q * 2 + 1;
        const fs = Math.round(16 * fontScale);
        ctx.font = `bold ${fs}px "Instrument Sans", system-ui, sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Position numbers: split the outer triangle into two halves
        const midAdj = [(adj1[0] + adj2[0]) / 2, (adj1[1] + adj2[1]) / 2];
        const n1x = (outerCorner[0] * 2 + adj1[0] + midAdj[0]) / 4;
        const n1y = (outerCorner[1] * 2 + adj1[1] + midAdj[1]) / 4;
        const n2x = (outerCorner[0] * 2 + adj2[0] + midAdj[0]) / 4;
        const n2y = (outerCorner[1] * 2 + adj2[1] + midAdj[1]) / 4;

        ctx.fillText(numbers[ni1], n1x, n1y);
        ctx.fillText(numbers[ni2], n2x, n2y);
      }

      // Inner triangle: centerCorner, adj1, adj2 — light background for messages
      ctx.fillStyle = '#fafafa';
      ctx.beginPath();
      ctx.moveTo(centerCorner[0], centerCorner[1]);
      ctx.lineTo(adj1[0], adj1[1]);
      ctx.lineTo(adj2[0], adj2[1]);
      ctx.closePath();
      ctx.fill();

      // Messages inside inner triangle
      const mi1 = q * 2;
      const mi2 = q * 2 + 1;
      const fs2 = Math.round(9 * fontScale);

      // Split inner triangle into two halves along center diagonal
      const midAdj2 = [(adj1[0] + adj2[0]) / 2, (adj1[1] + adj2[1]) / 2];

      // Message 1 — in first half
      const m1cx = (centerCorner[0] * 2 + adj1[0] + midAdj2[0]) / 4;
      const m1cy = (centerCorner[1] * 2 + adj1[1] + midAdj2[1]) / 4;
      drawMessage(messages[mi1], m1cx, m1cy, half * 0.28, fs2, col);

      // Message 2 — in second half
      const m2cx = (centerCorner[0] * 2 + adj2[0] + midAdj2[0]) / 4;
      const m2cy = (centerCorner[1] * 2 + adj2[1] + midAdj2[1]) / 4;
      drawMessage(messages[mi2], m2cx, m2cy, half * 0.28, fs2, col);
    }

    // Grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;

    // Outer border
    ctx.strokeRect(1, 1, S - 2, S - 2);

    // Cross lines (horizontal + vertical center)
    ctx.beginPath();
    ctx.moveTo(half, 0); ctx.lineTo(half, S);
    ctx.moveTo(0, half); ctx.lineTo(S, half);
    ctx.stroke();

    // Diagonals
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(S, S);
    ctx.moveTo(S, 0); ctx.lineTo(0, S);
    ctx.stroke();

    // Fold lines (dashed)
    if (showFold) {
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 0.6;
      ctx.setLineDash([6, 4]);
      // Quarter lines
      const q = half / 2;
      // No extra folds needed — the main folds are the cross + diagonals
      // Add small fold marks at corners
      const mark = 15;
      ctx.beginPath();
      // Corner fold indicators
      for (const [x, y] of [[0,0],[S,0],[0,S],[S,S]]) {
        ctx.moveTo(x === 0 ? 0 : S, y === 0 ? mark : S - mark);
        ctx.lineTo(x === 0 ? mark : S - mark, y === 0 ? 0 : S);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawMessage(text, cx, cy, maxW, fs, accentColor) {
    const lines = wrapText(text, maxW, fs);
    ctx.font = `${fs}px "Instrument Sans", system-ui, sans-serif`;
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = fs * 1.3;
    const startY = cy - (lines.length - 1) * lh / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, startY + i * lh);
    }
  }

  // --- Actions ---
  function regenerate() {
    seed = Math.floor(Math.random() * 100000);
    render();
  }

  function randomizeMessages() {
    const pool = [
      'Tu vas vivre une belle aventure',
      'Un ami te réserve une surprise',
      'Tu trouveras un trésor caché',
      'Quelqu\'un pense fort à toi',
      'Une bonne nouvelle arrive bientôt',
      'Tu vas éclater de rire aujourd\'hui',
      'Un voyage se prépare pour toi',
      'Ta journée sera extraordinaire',
      'Tu vas apprendre quelque chose',
      'Un cadeau t\'attend quelque part',
      'Tu feras une belle rencontre',
      'Le soleil brille pour toi',
      'Ta créativité va exploser',
      'Un rêve va se réaliser',
      'Quelque chose de magique approche',
      'Tu vas aider quelqu\'un aujourd\'hui',
    ];
    const rng = mulberry32(Date.now());
    const shuffled = pool.sort(() => rng() - 0.5);
    messages = shuffled.slice(0, 8);
    render();
  }

  // --- Export PDF ---
  async function exportPDF() {
    const { jsPDF } = await import('jspdf');

    // A4 with the cocotte centered (the cocotte is a square)
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297;
    const size = 170; // cocotte square size in mm
    const offX = (pageW - size) / 2;
    const offY = (pageH - size) / 2;

    // Render at high res
    const hiRes = document.createElement('canvas');
    const hiCtx = hiRes.getContext('2d');
    const hiS = 2000;
    hiRes.width = hiS;
    hiRes.height = hiS;

    // Save current state, render to temp canvas
    const origCtx = ctx;
    const origEl = canvasEl;
    ctx = hiCtx;
    const origSQUARE = SQUARE;
    // Scale hiCtx
    hiCtx.setTransform(hiS / SQUARE, 0, 0, hiS / SQUARE, 0, 0);
    render();
    ctx = origCtx;

    const imgData = hiRes.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', offX, offY, size, size);

    // Fold instructions text
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text('Cocotte en papier — pliio.fr', offX, offY + size + 8);
    pdf.text('Découpez le carré, pliez selon les lignes, inscrivez vos messages.', offX, offY + size + 12);

    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cocotte-pliio-${seed}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Re-render main canvas
    applyCanvasSize();
    render();
  }

  // --- Event handlers ---
  function handleKeydown(e) {
    if (e.code === 'Space' && !e.repeat && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      spaceDown = true;
      if (canvasEl) canvasEl.style.cursor = 'grab';
    }
    if (e.key === 's' && !e.ctrlKey && !e.metaKey && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      exportPDF();
    }
  }

  function handleKeyup(e) {
    if (e.code === 'Space') {
      spaceDown = false;
      isPanning = false;
      if (canvasEl) canvasEl.style.cursor = 'default';
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
    }
  }

  function handleAreaMousemove(e) {
    if (isPanning) doPan(e.clientX, e.clientY);
  }

  function handleAreaMouseup() {
    if (isPanning) endPan();
  }

  // --- Lifecycle ---
  onMount(() => {
    ctx = canvasEl.getContext('2d');
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

<div class="cocotte-app">
  <div class="controls">
    <div class="control-group">
      <h3>Couleurs</h3>
      <div class="color-grid">
        {#each colors as col, i}
          <label class="color-label">
            <span>Face {i + 1}</span>
            <input type="color" bind:value={colors[i]} oninput={render} />
          </label>
        {/each}
      </div>
    </div>

    <div class="control-group">
      <h3>Chiffres</h3>
      <div class="num-grid">
        {#each numbers as num, i}
          <input type="text" maxlength="3" bind:value={numbers[i]} oninput={render} class="num-input" />
        {/each}
      </div>
    </div>

    <div class="control-group">
      <h3>Messages</h3>
      <div class="msg-list">
        {#each messages as msg, i}
          <input type="text" bind:value={messages[i]} oninput={render} class="msg-input" placeholder="Message {i + 1}" />
        {/each}
      </div>
      <button class="btn btn-outline full-width" onclick={randomizeMessages} style="margin-top:0.5rem">Messages aléatoires</button>
    </div>

    <div class="control-group">
      <h3>Options</h3>
      <label>
        Motif décoratif
        <select bind:value={patternStyle} onchange={render}>
          {#each patternOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </label>
      <label>
        Taille texte : {fontScale.toFixed(1)}x
        <input type="range" min="0.6" max="1.6" step="0.1" bind:value={fontScale} oninput={render} />
      </label>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={showFold} onchange={render} />
        Repères de pliage
      </label>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={showNumbers} onchange={render} />
        Afficher les chiffres
      </label>
    </div>

    <div class="control-group actions">
      <button class="btn btn-primary full-width" onclick={exportPDF}>Exporter PDF (s)</button>
      <button class="btn btn-outline full-width" onclick={regenerate}>Nouveau motif</button>
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
  </div>
</div>

<style>
  .cocotte-app {
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

  .color-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }

  .color-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82rem;
    color: var(--text, #111);
  }

  .color-label input[type="color"] {
    width: 28px;
    height: 28px;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 4px;
    padding: 1px;
    cursor: pointer;
  }

  .num-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.3rem;
  }

  .num-input {
    width: 100%;
    text-align: center;
    padding: 0.3rem;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 3px;
    font-size: 0.85rem;
    font-family: monospace;
  }

  .msg-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .msg-input {
    width: 100%;
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 3px;
    font-size: 0.8rem;
  }

  label {
    display: block;
    font-size: 0.85rem;
    margin-bottom: 0.4rem;
    color: var(--text, #111);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    accent-color: var(--blue, #1A5CFF);
  }

  input[type="range"] {
    width: 100%;
    margin-top: 0.2rem;
    accent-color: var(--blue, #1A5CFF);
  }

  select {
    width: 100%;
    padding: 0.4rem;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 3px;
    font-size: 0.85rem;
    background: white;
    margin-top: 0.2rem;
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
    cursor: default;
  }

  .canvas-wrap canvas {
    display: block;
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
    .cocotte-app {
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
