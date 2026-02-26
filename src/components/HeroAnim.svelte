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

  /* ---- Timeline (seconds) ---- */
  const FADE_IN  = 0.4;   // each line fades in over 0.4s
  const HOLD     = 0.8;   // holds at peak for 0.8s
  const FADE_OUT = 1.2;   // fades out over 1.2s
  const MAX_DELAY = 1.2;  // stagger spread

  let startTime = 0;
  let done = false;

  function drawGrid() {
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
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
  }

  function render(elapsed) {
    if (!ctx || W === 0) return;
    ctx.clearRect(0, 0, W, H);

    drawGrid();

    if (done) return; // only grid remains

    const cols = Math.ceil(W / CELL) + 1;
    const rows = Math.ceil(H / CELL) + 1;
    const cx = W / 2, cy = H / 2;
    // max possible distance (corner to center) for normalizing delay
    const maxDist = Math.sqrt(cx * cx + cy * cy);

    let allDone = true;

    ctx.lineWidth = 1;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        // Skip ~80% of intersections (keep 1 in 5)
        if (perm[(c * 17 + r * 31) & 255] % 5 !== 0) continue;

        const x = c * CELL;
        const y = r * CELL;

        // Delay: distance from center + noise jitter
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const jitter = (noise(c * 0.5 + 50, r * 0.5 + 50) + 1) * 0.5 * 0.3;
        const delay = (dist / maxDist) * MAX_DELAY + jitter;

        // Timeline for this line
        const local = elapsed - delay;
        let alpha = 0;
        if (local < 0) {
          alpha = 0;
          allDone = false;
        } else if (local < FADE_IN) {
          alpha = local / FADE_IN;
          allDone = false;
        } else if (local < FADE_IN + HOLD) {
          alpha = 1;
          allDone = false;
        } else if (local < FADE_IN + HOLD + FADE_OUT) {
          alpha = 1 - (local - FADE_IN - HOLD) / FADE_OUT;
          allDone = false;
        }

        if (alpha < 0.01) continue;

        // Smoothstep the alpha
        alpha = alpha * alpha * (3 - 2 * alpha);

        // Color
        const cn = (noise(c * 0.6 + 73, r * 0.6 + 73) + 1) * 0.5;
        const ci = Math.floor(cn * COLORS.length) % COLORS.length;
        const [cr, cg, cb] = COLORS[ci];

        // Length: 2 or 4 cells
        const lenN = (noise(c * 0.4 + 31, r * 0.4 + 31) + 1) * 0.5;
        const barLen = CELL * 10;
        const isH = (c + r) % 2 === 0;

        // Gradient: center opaque, extremities transparent
        const half = barLen / 2;
        const peak = alpha * 0.6;
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

    if (allDone) done = true;
  }

  function animate(now) {
    const elapsed = (now - startTime) / 1000;
    render(elapsed);
    if (!done) {
      raf = requestAnimationFrame(animate);
    }
  }

  function resize() {
    if (!hero) return;
    const rect = hero.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvasEl.width = W * DPR;
    canvasEl.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (done) render(999); // redraw grid on resize
  }

  onMount(() => {
    hero = wrapEl.closest('.hero');
    ctx = canvasEl.getContext('2d');
    resize();
    startTime = performance.now();
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
