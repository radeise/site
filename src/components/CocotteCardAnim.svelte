<script>
  import { onMount, onDestroy } from 'svelte';

  let { overlay = false } = $props();

  let wrapEl;
  let canvasEl;
  let ctx;
  let raf;
  let observer;
  let hovering = $state(false);
  let progress = 0;
  const isTouch = typeof window !== 'undefined' && matchMedia('(hover: none)').matches;

  const W = 280, H = 200;
  const DPR = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

  const COLORS = ['#E63024', '#1A5CFF', '#FFD000', '#2ab54e'];
  const S = 120; // cocotte square size
  const OX = (W - S) / 2, OY = (H - S) / 2;
  const half = S / 2;

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    if (!overlay) {
      ctx.fillStyle = '#EFEFE6';
      ctx.fillRect(0, 0, W, H);
    }

    const p = progress;

    // 4 triangles, each colored, scale from center
    const quadrants = [
      { ox: 0, oy: 0, ci: 0 },
      { ox: half, oy: 0, ci: 1 },
      { ox: 0, oy: half, ci: 2 },
      { ox: half, oy: half, ci: 3 },
    ];

    for (let q = 0; q < 4; q++) {
      const { ox, oy, ci } = quadrants[q];

      const qx = OX + ox;
      const qy = OY + oy;

      const outerCorner = [qx + (q % 2 === 0 ? 0 : half), qy + (q < 2 ? 0 : half)];
      const adj1 = [qx + (q % 2 === 0 ? half : 0), qy + (q < 2 ? 0 : half)];
      const adj2 = [qx + (q % 2 === 0 ? 0 : half), qy + (q < 2 ? half : 0)];

      // Colored outer triangle — fades in with stagger
      const stagger = q * 0.15;
      const triP = Math.max(0, Math.min(1, (p - stagger) / 0.5));

      if (triP > 0) {
        ctx.globalAlpha = triP * (overlay ? 0.35 : 1);
        ctx.fillStyle = overlay ? '#fff' : COLORS[ci];
        ctx.beginPath();
        ctx.moveTo(outerCorner[0], outerCorner[1]);
        ctx.lineTo(adj1[0], adj1[1]);
        ctx.lineTo(adj2[0], adj2[1]);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Inner triangle (white/light)
      const centerCorner = [qx + (q % 2 === 0 ? half : 0), qy + (q < 2 ? half : 0)];
      const innerP = Math.max(0, Math.min(1, (p - stagger - 0.1) / 0.5));
      if (innerP > 0) {
        ctx.globalAlpha = innerP * (overlay ? 0.2 : 0.6);
        ctx.fillStyle = overlay ? '#fff' : '#fafafa';
        ctx.beginPath();
        ctx.moveTo(centerCorner[0], centerCorner[1]);
        ctx.lineTo(adj1[0], adj1[1]);
        ctx.lineTo(adj2[0], adj2[1]);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Structure lines — appear with progress
    const lineP = Math.max(0, Math.min(1, (p - 0.2) / 0.4));
    if (lineP > 0) {
      ctx.globalAlpha = lineP;
      ctx.strokeStyle = overlay ? 'rgba(255,255,255,0.5)' : '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(OX, OY, S, S);
      ctx.beginPath();
      ctx.moveTo(OX + half, OY); ctx.lineTo(OX + half, OY + S);
      ctx.moveTo(OX, OY + half); ctx.lineTo(OX + S, OY + half);
      ctx.stroke();

      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(OX, OY); ctx.lineTo(OX + S, OY + S);
      ctx.moveTo(OX + S, OY); ctx.lineTo(OX, OY + S);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Fold marks
    const foldP = Math.max(0, Math.min(1, (p - 0.5) / 0.3));
    if (foldP > 0) {
      ctx.globalAlpha = foldP * (overlay ? 0.35 : 0.5);
      ctx.strokeStyle = overlay ? 'rgba(255,255,255,0.6)' : '#999';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 3]);
      const mark = 10;
      ctx.beginPath();
      for (const [x, y] of [[OX,OY],[OX+S,OY],[OX,OY+S],[OX+S,OY+S]]) {
        ctx.moveTo(x === OX ? OX : OX + S, y === OY ? OY + mark : OY + S - mark);
        ctx.lineTo(x === OX ? OX + mark : OX + S - mark, y === OY ? OY : OY + S);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Resting state: light outline
    if (p < 0.05) {
      ctx.strokeStyle = overlay ? 'rgba(255,255,255,0.15)' : '#d0cbc5';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(OX, OY, S, S);
      ctx.beginPath();
      ctx.moveTo(OX + half, OY); ctx.lineTo(OX + half, OY + S);
      ctx.moveTo(OX, OY + half); ctx.lineTo(OX + S, OY + half);
      ctx.stroke();
    }
  }

  function animate() {
    if (hovering && progress < 1) {
      progress = Math.min(1, progress + 0.02);
    } else if (!hovering && progress > 0) {
      progress = Math.max(0, progress - 0.03);
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

    if (isTouch) {
      observer = new IntersectionObserver(
        ([e]) => { hovering = e.isIntersecting; },
        { threshold: 0.4 }
      );
      observer.observe(wrapEl);
    }
  });

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    if (observer) observer.disconnect();
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="card-anim" class:overlay bind:this={wrapEl} onmouseenter={enter} onmouseleave={leave}>
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
