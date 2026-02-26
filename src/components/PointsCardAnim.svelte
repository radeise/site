<script>
  import { onMount, onDestroy } from 'svelte';

  let { overlay = false } = $props();

  let canvasEl;
  let ctx;
  let raf;
  let hovering = $state(false);
  let progress = 0;

  const W = 280, H = 200;
  const DPR = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const PAD = 25;

  // Generate a constellation of points (seeded for consistency)
  function seededRng(seed) {
    let s = seed;
    return () => {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  const rng = seededRng(42);
  const NUM_POINTS = 18;
  const points = [];

  // Generate points in a nice organic shape (like a star/animal)
  for (let i = 0; i < NUM_POINTS; i++) {
    const angle = (i / NUM_POINTS) * Math.PI * 2 - Math.PI / 2;
    const baseR = 55 + rng() * 20;
    const wobble = Math.sin(angle * 3) * 15 + Math.cos(angle * 2) * 10;
    const r = baseR + wobble;
    points.push({
      x: W / 2 + Math.cos(angle) * r,
      y: H / 2 + Math.sin(angle) * r * 0.75,
    });
  }

  const DOT_R = 2.5;
  const LABEL_OFFSET = 10;

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    if (!overlay) {
      ctx.fillStyle = '#EFEFE6';
      ctx.fillRect(0, 0, W, H);
    }

    const p = progress;
    const totalSegments = points.length;
    const drawnSegments = p * totalSegments;

    // Draw connecting line (animated)
    if (drawnSegments > 0) {
      ctx.strokeStyle = overlay ? 'rgba(255,255,255,0.8)' : '#1a1a1a';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);

      const fullSegs = Math.floor(drawnSegments);
      const partialFrac = drawnSegments - fullSegs;

      for (let i = 1; i <= fullSegs && i < totalSegments; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }

      // Partial segment
      if (fullSegs < totalSegments - 1 && partialFrac > 0) {
        const from = points[fullSegs];
        const to = points[fullSegs + 1];
        ctx.lineTo(
          from.x + (to.x - from.x) * partialFrac,
          from.y + (to.y - from.y) * partialFrac
        );
      }

      // Close the shape when fully drawn
      if (fullSegs >= totalSegments - 1) {
        ctx.lineTo(points[0].x, points[0].y);
      }

      ctx.stroke();
    }

    // Draw dots (always visible)
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];

      // Dot grows when the line reaches it
      const dotProgress = Math.max(0, Math.min(1, (drawnSegments - i) * 2 + 0.5));
      const r = DOT_R * (0.5 + dotProgress * 0.5);

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      if (overlay) {
        ctx.fillStyle = drawnSegments >= i ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)';
      } else {
        ctx.fillStyle = drawnSegments >= i ? '#1a1a1a' : '#c8c4be';
      }
      ctx.fill();

      // Number label
      const labelAlpha = p < 0.02 ? 0.35 : Math.min(1, dotProgress);
      ctx.globalAlpha = labelAlpha;
      ctx.font = '500 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = overlay ? 'rgba(255,255,255,0.9)' : '#1a1a1a';

      // Place label outside the shape
      const cx = W / 2, cy = H / 2;
      const dx = pt.x - cx, dy = pt.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const lx = pt.x + (dx / dist) * LABEL_OFFSET;
      const ly = pt.y + (dy / dist) * LABEL_OFFSET;
      ctx.fillText(String(i + 1), lx, ly);
      ctx.globalAlpha = 1;
    }

    // Resting state hint
    if (p < 0.01) {
      // Light dashed connection preview
      ctx.strokeStyle = overlay ? 'rgba(255,255,255,0.15)' : '#d0cbc5';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.lineTo(points[0].x, points[0].y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function animate() {
    if (hovering && progress < 1) {
      progress = Math.min(1, progress + 0.015);
    } else if (!hovering && progress > 0) {
      progress = Math.max(0, progress - 0.025);
    }
    render();
    raf = requestAnimationFrame(animate);
  }

  function enter() { hovering = true; }
  function leave() { hovering = false; }

  onMount(() => {
    ctx = canvasEl.getContext('2d');
    canvasEl.width = W * DPR;
    canvasEl.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    render();
    raf = requestAnimationFrame(animate);
  });

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="card-anim" class:overlay onmouseenter={enter} onmouseleave={leave}>
  <canvas bind:this={canvasEl} style="width:{W}px;height:{H}px;"></canvas>
</div>

<style>
  .card-anim {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-warm, #EFEFE6);
  }
  .card-anim.overlay {
    position: absolute;
    inset: 0;
    background: transparent;
    z-index: 1;
  }
  .card-anim.overlay canvas {
    width: 100% !important;
    height: 100% !important;
  }
  canvas {
    display: block;
  }
</style>
