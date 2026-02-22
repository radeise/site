<script>
  import { onMount, onDestroy } from 'svelte';

  // --- Constants ---
  const A4_W = 210, A4_H = 297, MARGIN_MM = 20;
  const BASE_W = 520, BASE_H = Math.round(BASE_W * A4_H / A4_W);
  const MX = MARGIN_MM / A4_W, MY = MARGIN_MM / A4_H;
  const STAR_COLORS = ['#E63024','#1A5CFF','#2ab54e','#b5572a','#7b2ad4','#FFD000','#d42a6e','#2abcb5','#8b6e2a','#5a2ad4','#2ad49a','#d42a2a','#2a6eb5','#8bd42a','#b52a8b'];

  // --- State ---
  let tool = $state('trace');
  let rawStrokes = $state([]);
  let decorStrokes = $state([]);
  let currentStroke = $state(null);
  let isDrawing = false;
  let lastPt = null;
  let didMove = false;
  let mouseOnCanvas = false;

  // Zoom / Pan
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let spaceDown = false;
  let isPanning = false;
  let panMX = 0, panMY = 0, panSX = 0, panSY = 0;

  // Touch
  let touchMode = null, lastTouchDist = 0, lastTouchMid = { x: 0, y: 0 };

  // Settings
  let decorWidth = $state(3);
  let showPoints = $state(true);
  let numPoints = $state(40);
  let startNum = $state(1);
  let stepNum = $state(1);
  let dotSize = $state(6);
  let fontSize = $state(12);

  // Stats
  let statStrokes = $derived(rawStrokes.length);
  let statDecors = $derived(decorStrokes.length);
  let statPoints = $state(0);

  // DOM refs
  let canvasEl;
  let canvasWrap;
  let canvasArea;
  let brushEl;
  let ctx;

  const DPR = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const CW = BASE_W, CH = BASE_H;

  // --- Canvas size & transform ---
  function applyCanvasSize() {
    if (!canvasEl || !ctx) return;
    const pw = Math.round(BASE_W * zoom * DPR);
    const ph = Math.round(BASE_H * zoom * DPR);
    canvasEl.width = pw;
    canvasEl.height = ph;
    canvasEl.style.width = Math.round(BASE_W * zoom) + 'px';
    canvasEl.style.height = Math.round(BASE_H * zoom) + 'px';
    const sf = pw / CW;
    ctx.setTransform(sf, 0, 0, sf, 0, 0);
  }

  function updateTransform() {
    if (!canvasWrap) return;
    canvasWrap.style.transform = `translate(${panX}px,${panY}px)`;
  }

  function centerCanvas() {
    if (!canvasArea) return;
    const ar = canvasArea.getBoundingClientRect();
    const cw = BASE_W * zoom, ch = BASE_H * zoom;
    panX = Math.max(0, (ar.width - cw) / 2);
    panY = Math.max(0, (ar.height - ch) / 2);
    updateTransform();
  }

  function clampPan() {
    if (!canvasArea) return;
    const ar = canvasArea.getBoundingClientRect();
    const cw = BASE_W * zoom, ch = BASE_H * zoom;
    const minX = Math.min(0, ar.width - cw - 20);
    const maxX = Math.max(ar.width - cw, 20);
    const minY = Math.min(0, ar.height - ch - 20);
    const maxY = Math.max(ar.height - ch, 20);
    panX = Math.max(minX, Math.min(maxX, panX));
    panY = Math.max(minY, Math.min(maxY, panY));
  }

  // --- Helpers ---
  const inArea = (x, y) => x >= MX && x <= 1 - MX && y >= MY && y <= 1 - MY;
  const dd = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

  function clientToNorm(cx, cy) {
    const r = canvasEl.getBoundingClientRect();
    return { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height };
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
    updateCursor();
  }

  function doPan(cx, cy) {
    panX = panSX + (cx - panMX);
    panY = panSY + (cy - panMY);
    clampPan();
    updateTransform();
  }

  function endPan() {
    isPanning = false;
    updateCursor();
  }

  function updateCursor() {
    if (!canvasEl) return;
    if (spaceDown || isPanning) {
      canvasEl.style.cursor = isPanning ? 'grabbing' : 'grab';
      if (brushEl) brushEl.classList.remove('visible');
    } else if (tool === 'decor' && mouseOnCanvas) {
      canvasEl.style.cursor = 'none';
    } else {
      canvasEl.style.cursor = 'crosshair';
    }
  }

  // --- Brush cursor ---
  function updateBrush(e) {
    if (!brushEl) return;
    if (tool !== 'decor' || !mouseOnCanvas || spaceDown || isPanning) {
      brushEl.classList.remove('visible');
      return;
    }
    canvasEl.style.cursor = 'none';
    const px = decorWidth * zoom;
    brushEl.style.width = px + 'px';
    brushEl.style.height = px + 'px';
    brushEl.style.left = e.clientX + 'px';
    brushEl.style.top = e.clientY + 'px';
    brushEl.classList.add('visible');
  }

  // --- Drawing ---
  function startDraw(p) {
    if (spaceDown || isPanning) return;
    if (!inArea(p.x, p.y)) return;
    isDrawing = true;
    didMove = false;
    currentStroke = [{ x: p.x, y: p.y }];
    lastPt = { x: p.x, y: p.y };
    render();
  }

  function moveDraw(p, e) {
    if (e) updateBrush(e);
    if (!isDrawing || !currentStroke) return;
    if (!inArea(p.x, p.y)) return;
    if (dd(p, lastPt) >= 3 / (BASE_W * zoom)) {
      didMove = true;
      currentStroke = [...currentStroke, { x: p.x, y: p.y }];
      lastPt = { x: p.x, y: p.y };
      render();
    }
  }

  function endDraw() {
    if (!currentStroke) { isDrawing = false; return; }
    if (tool === 'decor') {
      if (didMove && currentStroke.length > 1) {
        decorStrokes = [...decorStrokes, { pts: currentStroke, width: decorWidth }];
      } else {
        decorStrokes = [...decorStrokes, { dot: { x: currentStroke[0].x, y: currentStroke[0].y }, width: decorWidth }];
      }
    } else {
      if (currentStroke.length > 1) {
        rawStrokes = [...rawStrokes, currentStroke];
      }
    }
    currentStroke = null;
    isDrawing = false;
    lastPt = null;
    didMove = false;
    render();
  }

  // --- Resample ---
  function resample(n) {
    if (!rawStrokes.length) return [];
    const sL = [];
    let tot = 0;
    for (const s of rawStrokes) {
      let l = 0;
      for (let i = 1; i < s.length; i++) l += dd(s[i], s[i - 1]);
      sL.push(l);
      tot += l;
    }
    if (!tot) return [];
    const m = 2, rem = Math.max(0, n - rawStrokes.length * m);
    const pp = rawStrokes.map((_, i) => m + Math.round(rem * (sL[i] / tot)));
    let sum = pp.reduce((a, b) => a + b, 0);
    while (sum > n) {
      let x = 0;
      for (let i = 1; i < pp.length; i++) if (pp[i] > pp[x]) x = i;
      if (pp[x] > m) { pp[x]--; sum--; } else break;
    }
    while (sum < n) {
      let x = 0;
      for (let i = 1; i < pp.length; i++) if (sL[i] > sL[x]) x = i;
      pp[x]++; sum++;
    }
    const res = [];
    for (let si = 0; si < rawStrokes.length; si++) {
      const s = rawStrokes[si], np = pp[si];
      if (s.length <= 1 || np <= 1) { res.push([{ x: s[0].x, y: s[0].y }]); continue; }
      const ar = [0];
      for (let i = 1; i < s.length; i++) ar.push(ar[i - 1] + dd(s[i], s[i - 1]));
      const sl = ar[ar.length - 1], pts = [];
      for (let i = 0; i < np; i++) {
        const t = (i / (np - 1)) * sl;
        let g = 0;
        while (g < ar.length - 2 && ar[g + 1] < t) g++;
        const gl = ar[g + 1] - ar[g], f = gl > 0 ? (t - ar[g]) / gl : 0;
        pts.push({ x: s[g].x + f * (s[g + 1].x - s[g].x), y: s[g].y + f * (s[g + 1].y - s[g].y) });
      }
      res.push(pts);
    }
    return res;
  }

  function buildPoints(n) {
    const sam = resample(n), pts = [];
    let pair = 0;
    for (let s = 0; s < sam.length; s++) {
      const st = sam[s];
      if (s > 0 && pts.length > 0) {
        pts[pts.length - 1].type = 'star-end';
        pts[pts.length - 1].pi = pair;
        pts.push({ x: st[0].x, y: st[0].y, type: 'star-start', pi: pair });
        pair++;
        for (let i = 1; i < st.length; i++) pts.push({ x: st[i].x, y: st[i].y, type: 'dot', pi: -1 });
      } else {
        for (let i = 0; i < st.length; i++) pts.push({ x: st[i].x, y: st[i].y, type: 'dot', pi: -1 });
      }
    }
    return pts;
  }

  // --- Labels ---
  function computeLabels(pts) {
    const base = 0.018, lW = 0.028, lH = 0.016, labels = [], occ = [];
    const angs = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, Math.PI, 2, -2, 2.5, -2.5, 3, -3];
    const ds = [base, base * 1.4, base * 1.8, base * 2.3, base * 2.8];
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i], prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      let tx, ty;
      if (pt.type === 'star-start' && i + 1 < pts.length) { tx = pts[i + 1].x - pt.x; ty = pts[i + 1].y - pt.y; }
      else if (pt.type === 'star-end' && i > 0) { tx = pt.x - pts[i - 1].x; ty = pt.y - pts[i - 1].y; }
      else { tx = next.x - prev.x; ty = next.y - prev.y; }
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      let nx = -ty / tl, ny = tx / tl;
      let bx = pt.x + nx * base, by = pt.y + ny * base, bd = base, ok2 = false;
      for (const sign of [1, -1]) {
        const sx = nx * sign, sy = ny * sign;
        for (const d of ds) {
          for (const a of angs) {
            const c = Math.cos(a), s = Math.sin(a);
            const rx = sx * c - sy * s, ry = sx * s + sy * c;
            const lx = pt.x + rx * d, ly = pt.y + ry * d;
            if (lx < MX + .005 || lx > 1 - MX - .005 || ly < MY + .005 || ly > 1 - MY - .005) continue;
            const rect = { x: lx - lW / 2, y: ly - lH / 2, w: lW, h: lH };
            let ok = true;
            for (const o of occ) if (rovl(rect, o)) { ok = false; break; }
            if (!ok) continue;
            for (const dot of pts) {
              if (Math.abs(lx - dot.x) < lW * .35 && Math.abs(ly - dot.y) < lH * .35) { ok = false; break; }
            }
            if (!ok) continue;
            bx = lx; by = ly; bd = d; ok2 = true; break;
          }
          if (ok2) break;
        }
        if (ok2) break;
      }
      occ.push({ x: bx - lW / 2, y: by - lH / 2, w: lW, h: lH });
      labels.push({ x: bx, y: by, leader: bd > base * 1.6 });
    }
    return labels;
  }

  function rovl(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }

  // --- Render ---
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, CW, CH);
    drawMargins();

    // Decor strokes
    for (const dc of decorStrokes) {
      if (dc.dot) drawDecorDot(dc.dot, dc.width);
      else drawStroke(dc.pts, '#1a1a1a', dc.width);
    }
    if (currentStroke && currentStroke.length > 1 && tool === 'decor')
      drawStroke(currentStroke, '#1a1a1a', decorWidth);

    const trC = showPoints ? '#93b5e0' : '#1a1a1a';
    const trW = showPoints ? 1.5 : 3;
    for (const s of rawStrokes) drawStroke(s, trC, trW);
    if (currentStroke && currentStroke.length > 1 && tool === 'trace') drawStroke(currentStroke, trC, trW);

    if (showPoints && rawStrokes.length > 0) {
      const pts = buildPoints(numPoints);
      if (pts.length > 0) {
        const labels = computeLabels(pts);
        ctx.strokeStyle = '#c8c4be';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < pts.length; i++) {
          if (labels[i].leader) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x * CW, pts[i].y * CH);
            ctx.lineTo(labels[i].x * CW, labels[i].y * CH);
            ctx.stroke();
          }
        }
        for (let i = 0; i < pts.length; i++) {
          const px = pts[i].x * CW, py = pts[i].y * CH;
          if (pts[i].type === 'star-end' || pts[i].type === 'star-start') {
            drawStar(px, py, dotSize + 1, STAR_COLORS[pts[i].pi % STAR_COLORS.length]);
          } else {
            ctx.beginPath();
            ctx.arc(px, py, dotSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = '#1a1a1a';
            ctx.fill();
          }
        }
        ctx.font = `500 ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#1a1a1a';
        for (let i = 0; i < labels.length; i++)
          ctx.fillText(startNum + i * stepNum, labels[i].x * CW, labels[i].y * CH);
        statPoints = pts.length;
      }
    } else {
      statPoints = showPoints ? 0 : 0;
    }

    if (!rawStrokes.length && !decorStrokes.length && !currentStroke) {
      ctx.fillStyle = '#bbb';
      ctx.font = '16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Dessinez ici', CW / 2, CH / 2 - 10);
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = '#aaa';
      ctx.fillText('Maintenez le clic et déplacez', CW / 2, CH / 2 + 12);
    }
  }

  function drawDecorDot(dot, width) {
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(dot.x * CW, dot.y * CH, width / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStroke(pts, color, width) {
    if (pts.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x * CW, pts[0].y * CH);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * CW, pts[i].y * CH);
    ctx.stroke();
  }

  function drawMargins() {
    ctx.fillStyle = 'rgba(239,239,230,0.55)';
    const mx = MX * CW, my = MY * CH;
    ctx.fillRect(0, 0, CW, my);
    ctx.fillRect(0, CH - my, CW, my);
    ctx.fillRect(0, my, mx, CH - 2 * my);
    ctx.fillRect(CW - mx, my, mx, CH - 2 * my);
    ctx.strokeStyle = '#d0cbc5';
    ctx.lineWidth = .5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(mx, my, CW - 2 * mx, CH - 2 * my);
    ctx.setLineDash([]);
  }

  function drawStar(cx, cy, sz, col) {
    const sp = 5, oR = sz, iR = sz * .45;
    ctx.beginPath();
    for (let i = 0; i < sp * 2; i++) {
      const a = (i * Math.PI / sp) - Math.PI / 2, r = i % 2 === 0 ? oR : iR;
      i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }

  // --- Tool switch ---
  function setTool(t) {
    tool = t;
    if (t !== 'decor' && brushEl) brushEl.classList.remove('visible');
    updateCursor();
  }

  // --- Undo ---
  function undo() {
    if (tool === 'trace' && rawStrokes.length > 0) rawStrokes = rawStrokes.slice(0, -1);
    else if (tool === 'decor' && decorStrokes.length > 0) decorStrokes = decorStrokes.slice(0, -1);
    render();
  }

  function clearAll() {
    rawStrokes = [];
    decorStrokes = [];
    currentStroke = null;
    render();
  }

  // --- PDF Export ---
  async function exportPDF() {
    const pts = buildPoints(numPoints);
    if (!pts.length) return;

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = A4_W, H = A4_H;
    const pxToMm = W / BASE_W;

    // Decor strokes
    for (const dc of decorStrokes) {
      const wMm = dc.width * pxToMm;
      if (dc.dot) {
        doc.setFillColor(30, 30, 30);
        doc.circle(dc.dot.x * W, dc.dot.y * H, wMm / 2, 'F');
      } else {
        doc.setDrawColor(30, 30, 30);
        doc.setLineWidth(wMm);
        doc.setLineCap('round');
        doc.setLineJoin('round');
        const p = dc.pts;
        if (p.length >= 2) {
          if (p.length > 2) {
            const segs = [];
            for (let i = 1; i < p.length; i++) segs.push([(p[i].x - p[i - 1].x) * W, (p[i].y - p[i - 1].y) * H]);
            doc.lines(segs, p[0].x * W, p[0].y * H, [1, 1], 'S');
          } else {
            doc.line(p[0].x * W, p[0].y * H, p[1].x * W, p[1].y * H);
          }
        }
      }
    }

    const labels = computeLabels(pts);
    doc.setDrawColor(200, 196, 190);
    doc.setLineWidth(.15);
    for (let i = 0; i < pts.length; i++) {
      if (labels[i].leader) doc.line(pts[i].x * W, pts[i].y * H, labels[i].x * W, labels[i].y * H);
    }
    for (let i = 0; i < pts.length; i++) {
      const px = pts[i].x * W, py = pts[i].y * H;
      if (pts[i].type === 'star-end' || pts[i].type === 'star-start') {
        starPDF(doc, px, py, dotSize * .22, STAR_COLORS[pts[i].pi % STAR_COLORS.length]);
      } else {
        doc.setFillColor(30, 30, 30);
        doc.circle(px, py, dotSize * .12, 'F');
      }
    }
    doc.setFontSize(fontSize);
    doc.setTextColor(30, 30, 30);
    for (let i = 0; i < labels.length; i++)
      doc.text(String(startNum + i * stepNum), labels[i].x * W, labels[i].y * H + fontSize * .12, { align: 'center' });
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(pts.length + ' points', W / 2, H - 6, { align: 'center' });
    doc.save('points-a-relier.pdf');
  }

  function hex2rgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }

  function starPDF(doc, cx, cy, sz, hex) {
    const [r, g, b] = hex2rgb(hex);
    const sp = 5, oR = sz, iR = sz * .45, ps = [];
    for (let i = 0; i < sp * 2; i++) {
      const a = (i * Math.PI / sp) - Math.PI / 2, rad = i % 2 === 0 ? oR : iR;
      ps.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
    }
    doc.setFillColor(r, g, b);
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0);
    for (let i = 0; i < ps.length; i++) {
      const p1 = ps[i], p2 = ps[(i + 1) % ps.length];
      doc.triangle(cx, cy, p1[0], p1[1], p2[0], p2[1], 'F');
    }
  }

  // --- Event handlers ---
  function handleKeydown(e) {
    if (e.code === 'Space' && !e.repeat && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      spaceDown = true;
      updateCursor();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    }
  }

  function handleKeyup(e) {
    if (e.code === 'Space') {
      spaceDown = false;
      isPanning = false;
      updateCursor();
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
      return;
    }
    if (e.button === 0 && e.target === canvasEl) {
      startDraw(clientToNorm(e.clientX, e.clientY));
    }
  }

  function handleAreaMousemove(e) {
    if (isPanning) { doPan(e.clientX, e.clientY); return; }
    if (e.target === canvasEl || mouseOnCanvas) {
      updateBrush(e);
      moveDraw(clientToNorm(e.clientX, e.clientY), e);
    }
  }

  function handleAreaMouseup(e) {
    if (isPanning && (e.button === 1 || (e.button === 0 && spaceDown))) { endPan(); return; }
    if (e.button === 0 && !isPanning) endDraw();
  }

  function handleCanvasEnter(e) { mouseOnCanvas = true; updateBrush(e); updateCursor(); }
  function handleCanvasLeave() {
    mouseOnCanvas = false;
    if (brushEl) brushEl.classList.remove('visible');
    updateCursor();
    if (isDrawing && !isPanning) endDraw();
  }

  function handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1 && !touchMode) {
      touchMode = 'draw';
      const t = e.touches[0];
      startDraw(clientToNorm(t.clientX, t.clientY));
    } else if (e.touches.length === 2) {
      touchMode = 'pinch';
      if (isDrawing) { currentStroke = null; isDrawing = false; render(); }
      const [a, b] = [e.touches[0], e.touches[1]];
      lastTouchDist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      lastTouchMid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      panSX = panX; panSY = panY; panMX = lastTouchMid.x; panMY = lastTouchMid.y;
    }
  }

  function handleTouchMove(e) {
    e.preventDefault();
    if (touchMode === 'draw' && e.touches.length === 1) {
      const t = e.touches[0];
      moveDraw(clientToNorm(t.clientX, t.clientY));
    } else if (touchMode === 'pinch' && e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      const scale = dist / lastTouchDist;
      zoomAt(zoom * scale, mid.x, mid.y);
      lastTouchDist = dist;
      panX += (mid.x - lastTouchMid.x);
      panY += (mid.y - lastTouchMid.y);
      clampPan();
      updateTransform();
      lastTouchMid = mid;
    }
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    if (touchMode === 'draw') endDraw();
    if (e.touches.length === 0) touchMode = null;
    else if (e.touches.length === 1 && touchMode === 'pinch') touchMode = null;
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

<div class="par-app">
  <div class="sidebar">
    <div class="info-box">
      <strong>Tracé</strong> : contour à relier.<br>
      <strong>Décor</strong> : détails libres.<br>
      Molette = zoom · Espace+glisser = déplacer.
    </div>

    <div class="control-section">
      <div class="section-label">Outil</div>
      <div class="tool-bar">
        <button class="tool-btn" class:active={tool === 'trace'} onclick={() => setTool('trace')}>Tracé</button>
        <button class="tool-btn" class:active={tool === 'decor'} onclick={() => setTool('decor')}>Décor</button>
      </div>
    </div>

    {#if tool === 'decor'}
      <div class="control-section">
        <div class="section-label">Taille du pinceau</div>
        <div class="range-row">
          <input type="range" bind:value={decorWidth} min="1" max="12" step="0.5" oninput={render} />
          <span class="range-val">{decorWidth}</span>
        </div>
      </div>
    {/if}

    <div class="stats-bar">
      <div>Traits: <span class="v">{statStrokes}</span></div>
      <div>Décors: <span class="v">{statDecors}</span></div>
      <div>Points: <span class="v">{statPoints}</span></div>
    </div>

    <div class="control-section">
      <div class="section-label">Affichage</div>
      <label class="switch-row">
        <span class="switch">
          <input type="checkbox" bind:checked={showPoints} onchange={render} />
          <span class="slider-toggle"></span>
        </span>
        <span class="switch-label-text">Points & numéros</span>
      </label>
    </div>

    <div class="control-section">
      <div class="section-label">Réglages points</div>
      <div class="control">
        <label>Nombre de points</label>
        <div class="range-row">
          <input type="range" bind:value={numPoints} min="5" max="150" step="1" oninput={render} />
          <span class="range-val">{numPoints}</span>
        </div>
      </div>
      <div class="row">
        <div class="control">
          <label>Début</label>
          <input type="number" bind:value={startNum} min="0" max="999" onchange={render} />
        </div>
        <div class="control">
          <label>Pas</label>
          <select bind:value={stepNum} onchange={render}>
            <option value={1}>1 en 1</option>
            <option value={2}>2 en 2</option>
            <option value={5}>5 en 5</option>
            <option value={10}>10 en 10</option>
          </select>
        </div>
      </div>
      <div class="row">
        <div class="control">
          <label>Points</label>
          <select bind:value={dotSize} onchange={render}>
            <option value={4}>Petit</option>
            <option value={6}>Moyen</option>
            <option value={8}>Grand</option>
          </select>
        </div>
        <div class="control">
          <label>Texte</label>
          <select bind:value={fontSize} onchange={render}>
            <option value={9}>Petit</option>
            <option value={12}>Moyen</option>
            <option value={15}>Grand</option>
          </select>
        </div>
      </div>
    </div>

    <div class="btn-row">
      <button class="btn btn-outline" onclick={undo}>Annuler</button>
      <button class="btn btn-danger" onclick={clearAll}>Effacer</button>
    </div>

    <div class="btn-row bottom-action">
      <button class="btn btn-primary full-width" onclick={exportPDF}>Exporter PDF A4</button>
    </div>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="canvas-area" bind:this={canvasArea}
    onmousedown={handleAreaMousedown}
    onmousemove={handleAreaMousemove}
    onmouseup={handleAreaMouseup}
    onwheel={handleWheel}>
    <div class="canvas-wrap" bind:this={canvasWrap}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <canvas bind:this={canvasEl}
        onmouseenter={handleCanvasEnter}
        onmouseleave={handleCanvasLeave}
        oncontextmenu={(e) => e.preventDefault()}
        ontouchstart={handleTouchStart}
        ontouchmove={handleTouchMove}
        ontouchend={handleTouchEnd}></canvas>
    </div>
    <div class="zoom-controls">
      <button class="zoom-btn" onclick={() => zoomCenter(-0.25)}>−</button>
      <span class="zoom-label">{Math.round(zoom * 100)}%</span>
      <button class="zoom-btn" onclick={() => zoomCenter(0.25)}>+</button>
      <button class="zoom-btn zoom-reset" onclick={resetZoom}>↺</button>
    </div>
  </div>
</div>

<div class="brush-cursor" bind:this={brushEl}></div>

<style>
  .par-app {
    display: flex;
    gap: 0;
    height: calc(100vh - 10rem);
    min-height: 600px;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }

  .sidebar {
    width: 280px;
    min-width: 280px;
    background: #fff;
    border-right: 1px solid var(--border, #E0E0E0);
    padding: 1.25rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    overflow-y: auto;
  }

  .info-box {
    font-size: 0.8rem;
    color: var(--text-soft, #555);
    line-height: 1.5;
    padding: 0.75rem;
    background: var(--bg-warm, #EFEFE6);
    border-radius: 6px;
  }

  .info-box strong {
    color: var(--text, #111);
  }

  .section-label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-soft, #555);
    margin-bottom: 0.4rem;
  }

  .control-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tool-bar {
    display: flex;
    gap: 0.4rem;
  }

  .tool-btn {
    font-family: var(--sans, system-ui);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.5rem 0.75rem;
    border: 2px solid var(--border, #E0E0E0);
    border-radius: 4px;
    background: #fff;
    color: var(--text, #111);
    cursor: pointer;
    transition: all 0.15s;
    flex: 1;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .tool-btn:hover {
    border-color: var(--blue, #1A5CFF);
    color: var(--blue, #1A5CFF);
  }

  .tool-btn.active {
    border-color: var(--blue, #1A5CFF);
    background: var(--blue, #1A5CFF);
    color: #fff;
  }

  .range-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .range-row input[type="range"] {
    flex: 1;
    accent-color: var(--blue, #1A5CFF);
  }

  .range-val {
    font-family: monospace;
    font-size: 0.85rem;
    font-weight: 600;
    min-width: 28px;
    text-align: right;
    color: var(--blue, #1A5CFF);
  }

  .stats-bar {
    font-family: monospace;
    font-size: 0.72rem;
    color: var(--text-soft, #555);
    padding: 0.5rem 0.75rem;
    background: var(--bg-warm, #EFEFE6);
    border-radius: 6px;
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .stats-bar .v {
    font-weight: 600;
    color: var(--text, #111);
  }

  .switch-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    cursor: pointer;
  }

  .switch {
    position: relative;
    width: 40px;
    height: 22px;
    flex-shrink: 0;
  }

  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider-toggle {
    position: absolute;
    inset: 0;
    background: var(--border, #E0E0E0);
    border-radius: 11px;
    cursor: pointer;
    transition: 0.2s;
  }

  .slider-toggle::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 3px;
    bottom: 3px;
    background: #fff;
    border-radius: 50%;
    transition: 0.2s;
  }

  .switch input:checked + .slider-toggle {
    background: var(--blue, #1A5CFF);
  }

  .switch input:checked + .slider-toggle::before {
    transform: translateX(18px);
  }

  .switch-label-text {
    font-size: 0.82rem;
    font-weight: 500;
  }

  .control {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .control label {
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--text, #111);
  }

  .control input[type="number"],
  .control select {
    font-family: monospace;
    font-size: 0.82rem;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 4px;
    background: #fff;
    color: var(--text, #111);
    outline: none;
    width: 100%;
  }

  .row {
    display: flex;
    gap: 0.5rem;
  }

  .row .control {
    flex: 1;
  }

  .btn-row {
    display: flex;
    gap: 0.4rem;
  }

  .btn-row .btn {
    flex: 1;
  }

  .bottom-action {
    margin-top: auto;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-family: var(--sans, system-ui);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.6rem 1rem;
    border: 1.5px solid var(--text, #111);
    border-radius: 3px;
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
    border-color: var(--border, #E0E0E0);
    color: var(--text, #111);
  }

  .btn-outline:hover {
    border-color: var(--blue, #1A5CFF);
    color: var(--blue, #1A5CFF);
  }

  .btn-danger {
    background: #fef2f0;
    color: var(--red, #E63024);
    border-color: #f0d4d0;
  }

  .btn-danger:hover {
    background: #fde6e3;
  }

  .full-width {
    width: 100%;
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

  :global(.brush-cursor) {
    position: fixed;
    pointer-events: none;
    border: 2px solid rgba(26, 26, 26, 0.5);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    opacity: 0;
    transition: opacity 0.08s;
    z-index: 999;
    background: rgba(26, 26, 26, 0.08);
  }

  :global(.brush-cursor.visible) {
    opacity: 1;
  }

  @media (max-width: 860px) {
    .par-app {
      flex-direction: column;
      height: auto;
      min-height: auto;
    }

    .sidebar {
      width: 100%;
      min-width: unset;
      border-right: none;
      border-bottom: 1px solid var(--border, #E0E0E0);
    }

    .canvas-area {
      height: 60vh;
    }
  }
</style>
