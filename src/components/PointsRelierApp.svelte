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

  // Settings
  let decorWidth = $state(3);
  let showPoints = $state(true);
  let numPoints = $state(50);
  let numCurves = $state(5);
  let startNum = $state(1);
  let stepNum = $state(1);
  let dotSize = $state(6);
  let fontSize = $state(12);
  let isGenerated = $state(false);
  let dotSpacing = $state(0.06);

  // Stats
  let statStrokes = $derived(rawStrokes.length);
  let statDecors = $derived(decorStrokes.length);
  let statPoints = $state(0);

  // DOM refs
  let canvasEl;
  let canvasArea;
  let brushEl;
  let ctx;

  const DPR = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const CW = BASE_W, CH = BASE_H;

  let displayW = $state(BASE_W);
  let displayH = $state(BASE_H);
  let showOptions = $state(false);

  // --- Canvas size (fit to container, maintain aspect ratio) ---
  function applyCanvasSize() {
    if (!canvasEl || !ctx) return;
    if (canvasArea) {
      const available = canvasArea.clientWidth - 32;
      const scale = Math.min(1, available / BASE_W);
      displayW = Math.round(BASE_W * scale);
      displayH = Math.round(BASE_H * scale);
    } else {
      displayW = BASE_W;
      displayH = BASE_H;
    }
    canvasEl.width = Math.round(BASE_W * DPR);
    canvasEl.height = Math.round(BASE_H * DPR);
    canvasEl.style.width = displayW + 'px';
    canvasEl.style.height = displayH + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  // --- Helpers ---
  const inArea = (x, y) => x >= MX && x <= 1 - MX && y >= MY && y <= 1 - MY;
  const dd = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

  // --- Curve generation (place dots directly via smooth random walk) ---
  function generateCurveDots(numDots) {
    const pad = 0.03;
    const x0 = MX + pad, x1 = 1 - MX - pad;
    const y0 = MY + pad, y1 = 1 - MY - pad;
    let x = x0 + Math.random() * (x1 - x0);
    let y = y0 + Math.random() * (y1 - y0);
    let angle = Math.random() * Math.PI * 2;

    const step = dotSpacing;
    const dots = [{ x, y }];

    // Random harmonics for smooth curvature variation
    const nh = 3 + Math.floor(Math.random() * 3);
    const harm = [];
    for (let h = 0; h < nh; h++) {
      harm.push({
        f: 0.2 + Math.random() * 1.2,
        a: 0.2 + Math.random() * 0.5,
        p: Math.random() * Math.PI * 2
      });
    }

    for (let i = 1; i < numDots; i++) {
      // Smooth angular change via sum of sinusoids
      let da = 0;
      for (const h of harm) da += Math.sin(i * h.f + h.p) * h.a;
      angle += da * 0.3;

      // Soft steering away from edges
      const edge = 0.06;
      let sx = 0, sy = 0;
      if (x < x0 + edge) sx = (x0 + edge - x) / edge;
      else if (x > x1 - edge) sx = -(x - (x1 - edge)) / edge;
      if (y < y0 + edge) sy = (y0 + edge - y) / edge;
      else if (y > y1 - edge) sy = -(y - (y1 - edge)) / edge;
      if (sx || sy) {
        const ta = Math.atan2(sy, sx);
        let diff = ta - angle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        angle += diff * 0.3;
      }

      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      x = Math.max(x0, Math.min(x1, x));
      y = Math.max(y0, Math.min(y1, y));
      dots.push({ x, y });
    }

    return dots;
  }

  // Ensure no two non-adjacent points are closer than dotSpacing
  function enforceMinDistance() {
    const minDist = dotSpacing;
    const pad = 0.03;
    const x0 = MX + pad, x1 = 1 - MX - pad;
    const y0 = MY + pad, y1 = 1 - MY - pad;

    const all = [];
    for (let s = 0; s < rawStrokes.length; s++) {
      for (let i = 0; i < rawStrokes[s].length; i++) {
        all.push({ s, i });
      }
    }

    for (let pass = 0; pass < 10; pass++) {
      let moved = false;
      for (let a = 0; a < all.length; a++) {
        for (let b = a + 1; b < all.length; b++) {
          if (all[a].s === all[b].s && Math.abs(all[a].i - all[b].i) <= 1) continue;
          const pa = rawStrokes[all[a].s][all[a].i];
          const pb = rawStrokes[all[b].s][all[b].i];
          const dx = pb.x - pa.x, dy = pb.y - pa.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist && dist > 1e-9) {
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist, ny = dy / dist;
            pa.x = Math.max(x0, Math.min(x1, pa.x - nx * overlap));
            pa.y = Math.max(y0, Math.min(y1, pa.y - ny * overlap));
            pb.x = Math.max(x0, Math.min(x1, pb.x + nx * overlap));
            pb.y = Math.max(y0, Math.min(y1, pb.y + ny * overlap));
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
  }

  function generate() {
    rawStrokes = [];
    decorStrokes = [];
    const base = Math.floor(numPoints / numCurves);
    let rem = numPoints - base * numCurves;
    for (let i = 0; i < numCurves; i++) {
      const n = base + (i < rem ? 1 : 0);
      rawStrokes.push(generateCurveDots(Math.max(2, n)));
    }
    enforceMinDistance();
    isGenerated = true;
    showPoints = true;
    render();
  }

  function clientToNorm(cx, cy) {
    const r = canvasEl.getBoundingClientRect();
    return { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height };
  }

  // --- Brush cursor ---
  function updateBrush(e) {
    if (!brushEl) return;
    if (tool !== 'decor' || !mouseOnCanvas) {
      brushEl.classList.remove('visible');
      return;
    }
    canvasEl.style.cursor = 'none';
    const bSize = decorWidth * (displayW / BASE_W);
    brushEl.style.width = bSize + 'px';
    brushEl.style.height = bSize + 'px';
    brushEl.style.left = e.clientX + 'px';
    brushEl.style.top = e.clientY + 'px';
    brushEl.classList.add('visible');
  }

  function updateCursor() {
    if (!canvasEl) return;
    if (tool === 'decor' && mouseOnCanvas) {
      canvasEl.style.cursor = 'none';
    } else {
      canvasEl.style.cursor = 'crosshair';
    }
  }

  // --- Drawing ---
  function startDraw(p) {
    if (!inArea(p.x, p.y)) return;
    isGenerated = false;
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
    const minDist = 3 / (BASE_W);
    if (dd(p, lastPt) >= minDist) {
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

  // --- Curvature-adaptive resample ---
  function weightedArcLen(s) {
    const w = [0];
    for (let i = 1; i < s.length; i++) {
      const seg = dd(s[i], s[i - 1]);
      let curv = 0;
      if (i >= 2) {
        const ax = s[i-1].x - s[i-2].x, ay = s[i-1].y - s[i-2].y;
        const bx = s[i].x - s[i-1].x, by = s[i].y - s[i-1].y;
        const la = Math.sqrt(ax*ax + ay*ay), lb = Math.sqrt(bx*bx + by*by);
        if (la > 1e-9 && lb > 1e-9) {
          const cosA = Math.max(-1, Math.min(1, (ax*bx + ay*by) / (la * lb)));
          curv = Math.acos(cosA);
        }
      }
      w.push(w[i - 1] + seg * (1 + 3 * curv));
    }
    return w;
  }

  function resample(n) {
    if (!rawStrokes.length) return [];
    const sL = [];
    let tot = 0;
    for (const s of rawStrokes) {
      const w = weightedArcLen(s);
      const wt = w[w.length - 1];
      sL.push(wt);
      tot += wt;
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
      const w = weightedArcLen(s);
      const wTotal = w[w.length - 1], pts = [];
      for (let i = 0; i < np; i++) {
        const t = (i / (np - 1)) * wTotal;
        let g = 0;
        while (g < w.length - 2 && w[g + 1] < t) g++;
        const gl = w[g + 1] - w[g], f = gl > 0 ? (t - w[g]) / gl : 0;
        pts.push({ x: s[g].x + f * (s[g + 1].x - s[g].x), y: s[g].y + f * (s[g + 1].y - s[g].y) });
      }
      res.push(pts);
    }
    return res;
  }

  function buildPoints(n) {
    const src = isGenerated ? rawStrokes : resample(n);
    const pts = [];
    for (let s = 0; s < src.length; s++) {
      const st = src[s];
      pts.push({ x: st[0].x, y: st[0].y, type: 'star-start', pi: s });
      for (let i = 1; i < st.length; i++) {
        pts.push({ x: st[i].x, y: st[i].y, type: 'dot', pi: -1 });
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
      statPoints = 0;
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
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x * CW, pts[1].y * CH);
    } else {
      // Catmull-Rom to cubic Bezier for smooth curves
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        const cp1x = (p1.x + (p2.x - p0.x) / 6) * CW;
        const cp1y = (p1.y + (p2.y - p0.y) / 6) * CH;
        const cp2x = (p2.x - (p3.x - p1.x) / 6) * CW;
        const cp2y = (p2.y - (p3.y - p1.y) / 6) * CH;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x * CW, p2.y * CH);
      }
    }
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
    isGenerated = false;
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    }
  }

  function handleMousedown(e) {
    if (e.button === 0 && e.target === canvasEl) {
      startDraw(clientToNorm(e.clientX, e.clientY));
    }
  }

  function handleMousemove(e) {
    if (e.target === canvasEl || mouseOnCanvas) {
      updateBrush(e);
      moveDraw(clientToNorm(e.clientX, e.clientY), e);
    }
  }

  function handleMouseup(e) {
    if (e.button === 0) endDraw();
  }

  function handleCanvasEnter(e) { mouseOnCanvas = true; updateBrush(e); updateCursor(); }
  function handleCanvasLeave() {
    mouseOnCanvas = false;
    if (brushEl) brushEl.classList.remove('visible');
    updateCursor();
    if (isDrawing) endDraw();
  }

  function handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      startDraw(clientToNorm(t.clientX, t.clientY));
    }
  }

  function handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && isDrawing) {
      const t = e.touches[0];
      moveDraw(clientToNorm(t.clientX, t.clientY));
    }
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    if (isDrawing) endDraw();
  }

  function handleResize() {
    applyCanvasSize();
    render();
  }

  // --- Lifecycle ---
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
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="canvas-area" bind:this={canvasArea}
    onmousedown={handleMousedown}
    onmousemove={handleMousemove}
    onmouseup={handleMouseup}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <canvas bind:this={canvasEl}
      onmouseenter={handleCanvasEnter}
      onmouseleave={handleCanvasLeave}
      oncontextmenu={(e) => e.preventDefault()}
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}></canvas>
  </div>

  <div class="action-bar">
    <div class="tool-bar">
      <button class="tool-btn" class:active={tool === 'trace'} onclick={() => setTool('trace')}>Tracé</button>
      <button class="tool-btn" class:active={tool === 'decor'} onclick={() => setTool('decor')}>Décor</button>
    </div>
    <button class="btn btn-primary" onclick={generate}>Générer</button>
    <button class="btn btn-outline" onclick={undo}>Annuler</button>
    <button class="btn btn-outline btn-danger" onclick={clearAll}>Effacer</button>
    <button class="btn btn-primary" onclick={exportPDF}>Exporter PDF</button>
  </div>

  <button class="toggle-options" onclick={() => { showOptions = !showOptions }}>
    <span class="toggle-arrow" class:open={showOptions}>&#9654;</span>
    Réglages
  </button>

  {#if showOptions}
    <div class="options-panel">
      <div class="opt-row">
        {#if tool === 'decor'}
          <div class="opt-group">
            <h3>Pinceau</h3>
            <label>
              Taille : {decorWidth}
              <input type="range" bind:value={decorWidth} min="1" max="12" step="0.5" oninput={render} />
            </label>
          </div>
        {/if}

        <div class="opt-group">
          <h3>Affichage</h3>
          <label class="switch-row">
            <span class="switch">
              <input type="checkbox" bind:checked={showPoints} onchange={render} />
              <span class="slider-toggle"></span>
            </span>
            <span class="switch-label-text">Points & numéros</span>
          </label>
        </div>

        <div class="opt-group">
          <h3>Points</h3>
          <label>
            Nombre : {numPoints}
            <input type="range" bind:value={numPoints} min="5" max="150" step="1" oninput={render} />
          </label>
        </div>

        <div class="opt-group">
          <h3>Courbes</h3>
          <label>
            Nombre : {numCurves}
            <input type="range" bind:value={numCurves} min="2" max="8" step="1" />
          </label>
        </div>

        <div class="opt-group">
          <h3>Espacement</h3>
          <label>
            Distance : {Math.round(dotSpacing * 100)}
            <input type="range" bind:value={dotSpacing} min="0.02" max="0.15" step="0.005" />
          </label>
        </div>

        <div class="opt-group">
          <h3>Numérotation</h3>
          <div class="num-row">
            <label>
              Début
              <input type="number" bind:value={startNum} min="0" max="999" onchange={render} />
            </label>
            <label>
              Pas
              <select bind:value={stepNum} onchange={render}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={5}>5</option>
                <option value={10}>10</option>
              </select>
            </label>
          </div>
        </div>

        <div class="opt-group">
          <h3>Taille</h3>
          <div class="num-row">
            <label>
              Points
              <select bind:value={dotSize} onchange={render}>
                <option value={4}>Petit</option>
                <option value={6}>Moyen</option>
                <option value={8}>Grand</option>
              </select>
            </label>
            <label>
              Texte
              <select bind:value={fontSize} onchange={render}>
                <option value={9}>Petit</option>
                <option value={12}>Moyen</option>
                <option value={15}>Grand</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div class="stats-bar">
        <div>Traits: <span class="v">{statStrokes}</span></div>
        <div>Décors: <span class="v">{statDecors}</span></div>
        <div>Points: <span class="v">{statPoints}</span></div>
      </div>
    </div>
  {/if}
</div>

<div class="brush-cursor" bind:this={brushEl}></div>

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
    cursor: crosshair;
  }

  /* --- Action bar --- */
  .action-bar {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border, #E0E0E0);
    flex-wrap: wrap;
  }

  .tool-bar {
    display: flex;
    gap: 0;
    margin-right: 0.5rem;
  }

  .tool-btn {
    font-family: var(--sans, system-ui);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.6rem 1rem;
    border: 1.5px solid var(--border, #E0E0E0);
    background: #fff;
    color: var(--text, #111);
    cursor: pointer;
    transition: all 0.15s;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .tool-btn:first-child {
    border-radius: 3px 0 0 3px;
  }

  .tool-btn:last-child {
    border-radius: 0 3px 3px 0;
    border-left: none;
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
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(26, 92, 255, 0.2);
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

  .btn-danger {
    color: var(--red, #E63024);
    border-color: #f0d4d0;
  }

  .btn-danger:hover {
    border-color: var(--red, #E63024);
    color: var(--red, #E63024);
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
    margin-bottom: 1rem;
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

  .num-row {
    display: flex;
    gap: 0.75rem;
  }

  .num-row label {
    flex: 1;
  }

  .stats-bar {
    font-family: monospace;
    font-size: 0.72rem;
    color: var(--text-soft, #555);
    padding: 0.5rem 0.75rem;
    background: #fff;
    border-radius: 6px;
    border: 1px solid var(--border, #E0E0E0);
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .stats-bar .v {
    font-weight: 600;
    color: var(--text, #111);
  }

  label {
    display: block;
    font-size: 0.85rem;
    margin-bottom: 0.4rem;
    color: var(--text, #111);
  }

  input[type="range"] {
    width: 100%;
    margin-top: 0.2rem;
    accent-color: var(--blue, #1A5CFF);
  }

  input[type="number"] {
    width: 100%;
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border, #E0E0E0);
    border-radius: 3px;
    font-size: 0.85rem;
    font-family: monospace;
    background: #fff;
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
    .canvas-area {
      padding: 1rem;
    }

    .opt-row {
      flex-direction: column;
      gap: 1rem;
    }

    .action-bar {
      padding: 0.75rem 1rem;
      gap: 0.5rem;
    }

    .btn {
      padding: 0.5rem 0.8rem;
      font-size: 0.72rem;
    }

    .tool-btn {
      padding: 0.5rem 0.75rem;
      font-size: 0.72rem;
    }
  }
</style>
