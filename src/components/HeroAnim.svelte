<script>
  import { onMount, onDestroy } from 'svelte';

  let wrapEl;
  let canvasEl;
  let ctx;
  let raf;
  let resizeObs;
  let W = 0, H = 0;
  let hero;

  const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const CELL = 48;
  const COLORS = [
    [230, 48, 36],   // --red
    [26, 92, 255],   // --blue
    [255, 208, 0],   // --yellow
    [42, 181, 78],   // green
  ];

  /* ---- Perlin 2D ---- */
  const perm = new Uint8Array(512);
  (() => {
    for (let i = 0; i < 256; i++) perm[i] = i;
    let s = 42;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  })();

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  function grad(hash, x, y) {
    const h = hash & 3;
    return ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  }
  function noise(x, y) {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v
    );
  }

  let time = 0;

  function render() {
    if (!ctx || W === 0) return;
    ctx.clearRect(0, 0, W, H);

    /* Grid lines — same as bg-grid */
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += CELL) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
    }
    for (let y = 0; y <= H; y += CELL) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();

    /* Colored lines at intersections */
    const cols = Math.ceil(W / CELL) + 1;
    const rows = Math.ceil(H / CELL) + 1;

    ctx.lineWidth = 1;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        // Smooth wave: noise → [0,1], used as a sine-like lifecycle
        const n = (noise(c * 0.28, r * 0.28 + time) + 1) * 0.5;

        // Smoothstep fade in / fade out — full range [0,1]
        const t = Math.max(0, Math.min(1, (n - 0.3) / 0.4));
        const alpha = t * t * (3 - 2 * t); // smoothstep
        if (alpha < 0.01) continue;

        const x = c * CELL;
        const y = r * CELL;

        // Color — stable per cell, varies spatially
        const cn = (noise(c * 0.6 + 73, r * 0.6 + 73) + 1) * 0.5;
        const ci = Math.floor(cn * COLORS.length) % COLORS.length;
        const [cr, cg, cb] = COLORS[ci];

        // Line length: 2 or 4 cells, snapped to grid intersections
        const lenN = (noise(c * 0.4 + 31, r * 0.4 + 31 + time * 0.5) + 1) * 0.5;
        const barLen = CELL * (lenN > 0.5 ? 4 : 2);

        // Direction: alternating H/V
        const isH = (c + r) % 2 === 0;

        // Gradient: center = peak alpha, extremities = 0 (paper fold)
        const half = barLen / 2;
        const peak = alpha * 0.55;
        let grd;
        if (isH) {
          grd = ctx.createLinearGradient(x - half, y, x + half, y);
        } else {
          grd = ctx.createLinearGradient(x, y - half, x, y + half);
        }
        grd.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
        grd.addColorStop(0.5, `rgba(${cr},${cg},${cb},${peak})`);
        grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);

        ctx.strokeStyle = grd;
        ctx.beginPath();
        if (isH) {
          ctx.moveTo(x - half, y + 0.5);
          ctx.lineTo(x + half, y + 0.5);
        } else {
          ctx.moveTo(x + 0.5, y - half);
          ctx.lineTo(x + 0.5, y + half);
        }
        ctx.stroke();
      }
    }
  }

  function animate() {
    time += 0.0025;
    render();
    raf = requestAnimationFrame(animate);
  }

  function resize() {
    if (!hero) return;
    const rect = hero.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvasEl.width = W * DPR;
    canvasEl.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  onMount(() => {
    hero = wrapEl.closest('.hero');
    ctx = canvasEl.getContext('2d');
    resize();
    render();
    raf = requestAnimationFrame(animate);
    resizeObs = new ResizeObserver(resize);
    resizeObs.observe(hero);
  });

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    if (resizeObs) resizeObs.disconnect();
  });
</script>

<div class="hero-canvas" bind:this={wrapEl}>
  <canvas bind:this={canvasEl}></canvas>
</div>

<style>
  .hero-canvas {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
