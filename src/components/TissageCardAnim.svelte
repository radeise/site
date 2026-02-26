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
  const COLS = 12;
  const ROWS = 16;
  const PAD = 20;
  const stripW = (W - PAD * 2) / COLS;
  const stripH = (H - PAD * 2) / ROWS;

  // Weave pattern — seeded for consistency
  const pattern = [];
  for (let r = 0; r < ROWS; r++) {
    pattern[r] = [];
    for (let c = 0; c < COLS; c++) {
      pattern[r][c] = (r + c) % 2 === 0;
    }
  }

  const warpColors = ['#1a1a1a', '#333', '#1a1a1a', '#444', '#222', '#1a1a1a', '#333', '#2a2a2a', '#1a1a1a', '#3a3a3a', '#222', '#1a1a1a'];
  const weftColors = ['#c8c4be', '#d4d0ca', '#bfbbb5', '#c8c4be', '#d0ccc6', '#c2beb8', '#ccc8c2', '#bab6b0', '#c8c4be', '#d2cec8', '#c0bcb6', '#c8c4be', '#ccc8c2', '#bfbbb5', '#c8c4be', '#d4d0ca'];

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    if (!overlay) {
      ctx.fillStyle = '#EFEFE6';
      ctx.fillRect(0, 0, W, H);
    }

    const maxCells = COLS * ROWS;
    const visibleCells = Math.floor(progress * maxCells);

    // Draw warp lines (vertical, always visible as base)
    for (let c = 0; c < COLS; c++) {
      const x = PAD + c * stripW;
      if (overlay) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.globalAlpha = 0.3 + progress * 0.5;
      } else {
        ctx.fillStyle = warpColors[c % warpColors.length];
        ctx.globalAlpha = 0.15 + progress * 0.15;
      }
      ctx.fillRect(x, PAD, stripW - 1, H - PAD * 2);
    }
    ctx.globalAlpha = 1;

    // Draw weft rows (horizontal, appearing with progress)
    for (let r = 0; r < ROWS; r++) {
      const y = PAD + r * stripH;
      const rowStart = r * COLS;

      for (let c = 0; c < COLS; c++) {
        const cellIdx = rowStart + c;
        if (cellIdx > visibleCells) break;

        const x = PAD + c * stripW;

        if (pattern[r][c]) {
          if (overlay) {
            const opacity = 0.15 + (r % 3) * 0.05;
            ctx.fillStyle = `rgba(255,255,255,${opacity})`;
          } else {
            ctx.fillStyle = weftColors[r % weftColors.length];
          }
          ctx.fillRect(x, y, stripW - 1, stripH - 1);
        }
      }
    }

    // Subtle frame
    ctx.strokeStyle = overlay ? 'rgba(255,255,255,0.2)' : '#d0cbc5';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(PAD, PAD, W - PAD * 2, H - PAD * 2);
  }

  function animate() {
    if (hovering && progress < 1) {
      progress = Math.min(1, progress + 0.018);
    } else if (!hovering && progress > 0) {
      progress = Math.max(0, progress - 0.025);
    }
    render();
    raf = requestAnimationFrame(animate);
  }

  function enter() { hovering = true; }
  function leave() { hovering = false; }

  let parentCard;

  onMount(() => {
    ctx = canvasEl.getContext('2d');
    canvasEl.width = W * DPR;
    canvasEl.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    render();
    raf = requestAnimationFrame(animate);

    if (overlay) {
      parentCard = wrapEl.closest('.product-card') || wrapEl.parentElement;
      parentCard.addEventListener('mouseenter', enter);
      parentCard.addEventListener('mouseleave', leave);
    }

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
    if (parentCard) {
      parentCard.removeEventListener('mouseenter', enter);
      parentCard.removeEventListener('mouseleave', leave);
    }
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="card-anim" class:overlay bind:this={wrapEl} onmouseenter={overlay ? undefined : enter} onmouseleave={overlay ? undefined : leave}>
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
    pointer-events: none;
  }
  .card-anim.overlay canvas {
    width: 100% !important;
    height: 100% !important;
  }
  canvas {
    display: block;
  }
</style>
