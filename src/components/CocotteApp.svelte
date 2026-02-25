<script>
  import { onMount, onDestroy } from 'svelte';

  // --- Constants ---
  const SQUARE = 520;
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

  const MESSAGE_POOL = [
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

  const patternOptions = [
    { value: 'dots', label: 'Points' },
    { value: 'lines', label: 'Lignes' },
    { value: 'circles', label: 'Cercles' },
    { value: 'crosses', label: 'Croix' },
    { value: 'none', label: 'Aucun' },
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

  let showOptions = $state(false);

  // DOM refs
  let canvasEl;
  let canvasArea;
  let ctx;
  let displaySize = $state(SQUARE);

  // --- Seeded random ---
  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // --- Canvas size (fit to container, always square) ---
  function applyCanvasSize() {
    if (!canvasEl || !ctx) return;
    if (canvasArea) {
      const available = canvasArea.clientWidth - 32;
      displaySize = Math.min(SQUARE, available);
    }
    canvasEl.width = Math.round(SQUARE * DPR);
    canvasEl.height = Math.round(SQUARE * DPR);
    canvasEl.style.width = displaySize + 'px';
    canvasEl.style.height = displaySize + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
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
        ctx.beginPath();
        ctx.moveTo(cx + cos * i - sin * radius * 2, cy + sin * i + cos * radius * 2);
        ctx.lineTo(cx + cos * i + sin * radius * 2, cy + sin * i - cos * radius * 2);
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

    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, S, S);

    const quadrants = [
      { ox: 0, oy: 0, ci: 0 },
      { ox: half, oy: 0, ci: 1 },
      { ox: 0, oy: half, ci: 2 },
      { ox: half, oy: half, ci: 3 },
    ];

    for (let q = 0; q < 4; q++) {
      const { ox, oy, ci } = quadrants[q];
      const col = colors[ci];

      const outerCorner = [ox + (q % 2 === 0 ? 0 : half), oy + (q < 2 ? 0 : half)];
      const centerCorner = [ox + (q % 2 === 0 ? half : 0), oy + (q < 2 ? half : 0)];
      const adj1 = [ox + (q % 2 === 0 ? half : 0), oy + (q < 2 ? 0 : half)];
      const adj2 = [ox + (q % 2 === 0 ? 0 : half), oy + (q < 2 ? half : 0)];

      // Outer triangle (colored)
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(outerCorner[0], outerCorner[1]);
      ctx.lineTo(adj1[0], adj1[1]);
      ctx.lineTo(adj2[0], adj2[1]);
      ctx.closePath();
      ctx.fill();

      const ocx = (outerCorner[0] + adj1[0] + adj2[0]) / 3;
      const ocy = (outerCorner[1] + adj1[1] + adj2[1]) / 3;
      drawPattern(rng, ocx, ocy, half * 0.38, col, patternStyle);

      // Numbers
      if (showNumbers) {
        const ni1 = q * 2, ni2 = q * 2 + 1;
        const fs = Math.round(16 * fontScale);
        ctx.font = `bold ${fs}px "Instrument Sans", system-ui, sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const midAdj = [(adj1[0] + adj2[0]) / 2, (adj1[1] + adj2[1]) / 2];
        ctx.fillText(numbers[ni1], (outerCorner[0] * 2 + adj1[0] + midAdj[0]) / 4, (outerCorner[1] * 2 + adj1[1] + midAdj[1]) / 4);
        ctx.fillText(numbers[ni2], (outerCorner[0] * 2 + adj2[0] + midAdj[0]) / 4, (outerCorner[1] * 2 + adj2[1] + midAdj[1]) / 4);
      }

      // Inner triangle (messages)
      ctx.fillStyle = '#fafafa';
      ctx.beginPath();
      ctx.moveTo(centerCorner[0], centerCorner[1]);
      ctx.lineTo(adj1[0], adj1[1]);
      ctx.lineTo(adj2[0], adj2[1]);
      ctx.closePath();
      ctx.fill();

      const mi1 = q * 2, mi2 = q * 2 + 1;
      const fs2 = Math.round(9 * fontScale);
      const midAdj2 = [(adj1[0] + adj2[0]) / 2, (adj1[1] + adj2[1]) / 2];
      drawMessage(messages[mi1], (centerCorner[0] * 2 + adj1[0] + midAdj2[0]) / 4, (centerCorner[1] * 2 + adj1[1] + midAdj2[1]) / 4, half * 0.28, fs2);
      drawMessage(messages[mi2], (centerCorner[0] * 2 + adj2[0] + midAdj2[0]) / 4, (centerCorner[1] * 2 + adj2[1] + midAdj2[1]) / 4, half * 0.28, fs2);
    }

    // Structure lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, S - 2, S - 2);
    ctx.beginPath();
    ctx.moveTo(half, 0); ctx.lineTo(half, S);
    ctx.moveTo(0, half); ctx.lineTo(S, half);
    ctx.stroke();

    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(S, S);
    ctx.moveTo(S, 0); ctx.lineTo(0, S);
    ctx.stroke();

    if (showFold) {
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 0.6;
      ctx.setLineDash([6, 4]);
      const mark = 15;
      ctx.beginPath();
      for (const [x, y] of [[0,0],[S,0],[0,S],[S,S]]) {
        ctx.moveTo(x === 0 ? 0 : S, y === 0 ? mark : S - mark);
        ctx.lineTo(x === 0 ? mark : S - mark, y === 0 ? 0 : S);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawMessage(text, cx, cy, maxW, fs) {
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
    const rng = mulberry32(seed);
    const hues = [0, 60, 120, 200, 270, 330];
    for (let i = 0; i < 4; i++) {
      const h = hues[Math.floor(rng() * hues.length)];
      const s = 65 + Math.floor(rng() * 25);
      const l = 45 + Math.floor(rng() * 15);
      colors[i] = hslToHex(h + Math.floor(rng() * 30 - 15), s, l);
    }
    const shuffled = [...MESSAGE_POOL].sort(() => rng() - 0.5);
    messages = shuffled.slice(0, 8);
    patternStyle = patternOptions[Math.floor(rng() * patternOptions.length)].value;
    render();
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }

  // --- Export PDF ---
  async function exportPDF() {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210, pageH = 297;
    const size = 170;
    const offX = (pageW - size) / 2;
    const offY = (pageH - size) / 2;

    const hiRes = document.createElement('canvas');
    const hiCtx = hiRes.getContext('2d');
    const hiS = 2000;
    hiRes.width = hiS;
    hiRes.height = hiS;

    const origCtx = ctx;
    ctx = hiCtx;
    hiCtx.setTransform(hiS / SQUARE, 0, 0, hiS / SQUARE, 0, 0);
    render();
    ctx = origCtx;

    const imgData = hiRes.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', offX, offY, size, size);

    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text('Cocotte en papier — pliio.fr', offX, offY + size + 8);
    pdf.text('Découpez le carré, pliez selon les lignes.', offX, offY + size + 12);

    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cocotte-pliio-${seed}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- Keyboard shortcut ---
  function handleKeydown(e) {
    if (e.key === 's' && !e.ctrlKey && !e.metaKey && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      exportPDF();
    }
  }

  // --- Lifecycle ---
  function handleResize() {
    applyCanvasSize();
    render();
  }

  onMount(() => {
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
    <button class="btn btn-primary" onclick={exportPDF}>Exporter PDF</button>
  </div>

  <button class="toggle-options" onclick={() => { showOptions = !showOptions }}>
    <span class="toggle-arrow" class:open={showOptions}>&#9654;</span>
    Personnaliser
  </button>

  {#if showOptions}
    <div class="options-panel">
      <div class="opt-row">
        <div class="opt-group">
          <h3>Couleurs</h3>
          <div class="color-grid">
            {#each colors as col, i}
              <label class="color-label">
                <input type="color" bind:value={colors[i]} oninput={render} />
                <span>Face {i + 1}</span>
              </label>
            {/each}
          </div>
        </div>

        <div class="opt-group">
          <h3>Chiffres</h3>
          <div class="num-grid">
            {#each numbers as num, i}
              <input type="text" maxlength="3" bind:value={numbers[i]} oninput={render} class="num-input" />
            {/each}
          </div>
        </div>

        <div class="opt-group">
          <h3>Style</h3>
          <label>
            Motif
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
        </div>
      </div>

      <div class="opt-row">
        <div class="opt-group opt-messages">
          <h3>Messages</h3>
          <div class="msg-grid">
            {#each messages as msg, i}
              <input type="text" bind:value={messages[i]} oninput={render} class="msg-input" placeholder="Message {i + 1}" />
            {/each}
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

  .color-grid {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .color-label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
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
    display: flex;
    gap: 0.3rem;
  }

  .num-input {
    width: 40px;
    text-align: center;
    padding: 0.35rem;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 3px;
    font-size: 0.85rem;
    font-family: monospace;
    background: #fff;
  }

  .msg-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }

  .msg-input {
    width: 100%;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 3px;
    font-size: 0.8rem;
    background: #fff;
  }

  label {
    display: block;
    font-size: 0.85rem;
    margin-bottom: 0.4rem;
    color: var(--text, #111);
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

  input[type="range"] {
    width: 100%;
    margin-top: 0.2rem;
    accent-color: var(--blue, #1A5CFF);
  }

  @media (max-width: 860px) {
    .canvas-area {
      padding: 1rem;
    }

    .opt-row {
      flex-direction: column;
      gap: 1rem;
    }

    .msg-grid {
      grid-template-columns: 1fr;
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
