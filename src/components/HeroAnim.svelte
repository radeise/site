<script>
  import { onMount, onDestroy } from 'svelte';

  let canvasEl;
  let ctx;
  let raf;
  let resizeObs;
  let W = 0, H = 0;

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

    /* Colored marks at intersections */
    const cols = Math.ceil(W / CELL) + 1;
    const rows = Math.ceil(H / CELL) + 1;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const n = (noise(c * 0.28, r * 0.28 + time) + 1) * 0.5; // → [0,1]

        if (n < 0.52) continue;

        const intensity = (n - 0.52) / 0.48; // → [0,1]
        const x = c * CELL;
        const y = r * CELL;

        // Color — stable per cell, varies spatially
        const cn = (noise(c * 0.6 + 73, r * 0.6 + 73) + 1) * 0.5;
        const ci = Math.floor(cn * COLORS.length) % COLORS.length;
        const [cr, cg, cb] = COLORS[ci];

        // Weave hint: alternating H/V bars at higher intensity
        if (intensity > 0.35) {
          const isH = (c + r) % 2 === 0;
          const barLen = CELL * 0.55;
          const barW = 2 + intensity * 2;
          const alpha = intensity * 0.18;
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
          if (isH) {
            ctx.fillRect(x - barLen / 2, y - barW / 2, barLen, barW);
          } else {
            ctx.fillRect(x - barW / 2, y - barLen / 2, barW, barLen);
          }
        }

        // Small dot at intersection
        const dotSize = 2 + intensity * 3.5;
        const dotAlpha = intensity * 0.3;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${dotAlpha})`;
        ctx.fillRect(x - dotSize / 2, y - dotSize / 2, dotSize, dotSize);
      }
    }
  }

  function animate() {
    time += 0.0025;
    render();
    raf = requestAnimationFrame(animate);
  }

  function resize() {
    const rect = canvasEl.parentElement.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvasEl.width = W * DPR;
    canvasEl.height = H * DPR;
    canvasEl.style.width = W + 'px';
    canvasEl.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  onMount(() => {
    ctx = canvasEl.getContext('2d');
    resize();
    render();
    raf = requestAnimationFrame(animate);
    resizeObs = new ResizeObserver(resize);
    resizeObs.observe(canvasEl.parentElement);
  });

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    if (resizeObs) resizeObs.disconnect();
  });
</script>

<canvas bind:this={canvasEl}></canvas>

<style>
  canvas {
    position: absolute;
    inset: 0;
    display: block;
    pointer-events: none;
  }
</style>
