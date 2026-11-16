/* 低頭族 DASH: dodge Hong Kong's phone zombies.
   A first-person, pseudo-3D canvas runner. No libraries needed.
   Controls: ← → / A D, or tap the left / right half of the game. */
(function () {
  'use strict';

  const canvas = document.getElementById('pzCanvas');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');

  // ---------- World and camera ----------
  const W = 360, H = 540;                 // logical size; scaled to fit the screen
  const HORIZON = Math.round(H * 0.36);
  const CAM_H = 1.6;                      // eye height in metres
  const F = (H - HORIZON) * 2.2 / CAM_H;  // focal length: ground meets screen bottom 2.2 m ahead
  const LANES = 4, LANE_W = 1.4, ROAD_HALF = LANES * LANE_W / 2;
  const WALL_X = ROAD_HALF + 1.8;         // shopfronts beyond the pavement
  const Z_FAR = 60, Z_CLIP = 0.4;
  const PED_SPEED = 1.3;                  // phone zombies shuffle towards you
  const HIT_Z = 1.35, HIT_X = 0.7;
  const START_SPEED = 6, MAX_SPEED = 16;

  const PIXEL = "'Press Start 2P', monospace";
  const CJK = "'PingFang HK','Noto Sans HK','Noto Sans CJK TC','Microsoft JhengHei',sans-serif";

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const chance = (p) => Math.random() < p;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const laneX = (i) => (i - (LANES - 1) / 2) * LANE_W;

  let camX = laneX(1), bob = 0;
  const sx = (x, z) => W / 2 + (x - camX) * F / z;
  const sy = (y, z) => HORIZON + bob + (CAM_H - y) * F / z;

  // ---------- Palettes ----------
  const BUILD_COLORS = ['#3b3346', '#2f3a4a', '#4a3a3a', '#3a4440', '#463d52', '#33363f', '#4b4238', '#3d2f3f'];
  const WINDOW_COLORS = ['#ffd27a', '#fff1c1', '#9ad7ff', '#ffb36b', '#ffe9a8'];
  const NEON = ['#ff2d55', '#00e5ff', '#ffe600', '#ff7a00', '#39ff14', '#ff4dff'];
  const SIGN_TEXT = ['茶餐廳', '大押', '藥房', '粥麵', '酒家', '金行', '涼茶', '燒味', '冰室', '找換', '眼鏡', '麻雀', '士多', '車仔麵', '海鮮'];
  const COATS = ['#1d2a44', '#222226', '#6b6257', '#c8b89a', '#7a7f86', '#3d4a3a', '#e8e6e1', '#5a2e3a', '#2e4f6b', '#8a3b3b'];
  const PANTS = ['#1a1a1a', '#2b2f3a', '#3a3a3a', '#4a4038', '#20283a'];
  const SKIN = ['#f1d0b0', '#e8c19c', '#d9aa82', '#c8946a'];
  const HAIR = ['#141414', '#1f1a17', '#2b211b', '#3a2a20'];
  const MASKS = ['#bfe3f5', '#f4f6f8', '#202020', '#f6c9d6', '#9fd8c4', '#bfe3f5', '#f4f6f8'];
  const PHONES = ['#111111', '#e9e9e9', '#f2b8c6', '#6b8cff', '#ffd34d', '#2a2a2a'];

  const MESSAGES = [
    "She didn't look up. She never looks up.",
    'His phone is fine. You are not.',
    "He's still replying to the family group chat.",
    'Your Octopus card is now in a drain.',
    "Auntie didn't stop. Auntie never stops.",
    'He muttered "咩呀你" and kept scrolling.',
    'Breaking news: man walks into man. Neither saw it coming.',
    'She was 3 seconds from finishing her drama episode.',
    'He apologised to his phone, not to you.',
    'Mong Kok claims another victim.',
  ];

  // ---------- Scenery ----------
  let buildings = [], signs = [], skyline = [], scroll = 0;

  function makeBuilding(side, z1) {
    const len = rand(6, 13), h = rand(14, 38);
    const cols = Math.max(2, Math.round(len / 2.2)), rows = Math.floor((h - 1) / 3);
    const lit = [];
    for (let i = 0; i < cols * rows; i++) lit.push(chance(0.45) ? pick(WINDOW_COLORS) : null);
    return { side, z1, z2: z1 + len, h, color: pick(BUILD_COLORS), cols, rows, lit };
  }

  function makeSign(z) {
    const side = chance(0.5) ? -1 : 1;
    const text = pick(SIGN_TEXT);
    const vertical = chance(0.5);
    const w = vertical ? 0.9 : 0.75 * text.length + 0.5;
    const h = vertical ? 0.72 * text.length + 0.45 : 1.0;
    const inner = Math.max(1.0, WALL_X - 0.15 - w - rand(0, 0.8));
    return { z, xc: side * (inner + w / 2), w, h, y: rand(3.6, 7.5), text, vertical,
      color: pick(NEON), flicker: chance(0.15), seed: rand(0, 100) };
  }

  function initScenery() {
    buildings = []; signs = [];
    for (const side of [-1, 1]) {
      let z = 0.3;
      while (z < Z_FAR + 20) { const b = makeBuilding(side, z); buildings.push(b); z = b.z2 + rand(0, 0.5); }
    }
    let z = 2;
    while (z < Z_FAR + 10) { signs.push(makeSign(z)); z += rand(3, 7); }

    skyline = [];
    let x = -40;
    while (x < W + 40) {
      const w = rand(10, 28), h = rand(14, 70), lights = [];
      for (let i = 0; i < h / 7; i++) if (chance(0.5)) lights.push([rand(2, w - 4), rand(4, h - 3)]);
      skyline.push({ x, w, h, lights });
      x += w + rand(-4, 2);
    }
  }

  function moveScenery(dz) {
    if (dz <= 0) return;
    scroll += dz;
    for (const b of buildings) { b.z1 -= dz; b.z2 -= dz; }
    for (const s of signs) s.z -= dz;
    buildings = buildings.filter((b) => b.z2 > 0.3);
    signs = signs.filter((s) => s.z > 0.5);
    for (const side of [-1, 1]) {
      let last = 0;
      for (const b of buildings) if (b.side === side) last = Math.max(last, b.z2);
      while (last < Z_FAR + 20) { const b = makeBuilding(side, last + rand(0, 0.5)); buildings.push(b); last = b.z2; }
    }
    let lastS = signs.length ? signs[signs.length - 1].z : 0;
    while (lastS < Z_FAR + 10) { lastS += rand(3, 7); signs.push(makeSign(lastS)); }
  }

  // ---------- Phone zombies ----------
  let peds = [];

  function makePed(lane, z) {
    const r = Math.random();
    const kind = r < 0.25 ? 'auntie' : r < 0.5 ? 'office' : r < 0.72 ? 'student' : 'casual';
    const mask = chance(0.72) ? pick(MASKS) : null;
    return {
      lane, z, kind, mask,
      x: laneX(lane) + rand(-0.15, 0.15),
      h: rand(1.58, 1.8) * (kind === 'auntie' ? 0.92 : 1),
      coat: pick(COATS), pants: pick(PANTS), skin: pick(SKIN),
      hair: kind === 'auntie' ? pick(['#2b211b', '#5a5a5a', '#4a2a2a', '#7a7a7a']) : pick(HAIR),
      glasses: chance(kind === 'student' ? 0.7 : 0.4),
      longHair: kind !== 'office' && chance(0.4),
      phone: pick(PHONES),
      tie: pick(['#b3202a', '#1d3a7a', '#3a3a3a']),
      shoes: kind === 'student' ? '#eeeeee' : '#111111',
      bag: kind === 'auntie' ? 'stripes' : kind === 'student' ? 'backpack' : chance(0.3) ? 'tote' : null,
      tilt: rand(-0.12, 0.12),
      phase: rand(0, Math.PI * 2),
      checked: false,
    };
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function ellipse(x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPed(p) {
    const s = F / p.z;
    const px = sx(p.x, p.z), py = sy(0, p.z);
    if (px < -s || px > W + s || py - 1.9 * s > H) return;

    ctx.save();
    ctx.globalAlpha = clamp((Z_FAR + 1 - p.z) / 8, 0, 1);
    ctx.translate(px, py);
    ctx.scale(s, s);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ellipse(0, 0, 0.32, 0.06);

    const k = p.h / 1.7;
    ctx.scale(k, k);
    const sw = Math.sin(p.phase);
    const by = -Math.abs(Math.cos(p.phase)) * 0.02;

    // Legs and shoes (front view: the stepping leg lifts)
    for (const [lx, ph] of [[-0.085, sw], [0.085, -sw]]) {
      const up = Math.max(0, ph) * 0.06;
      ctx.fillStyle = p.pants;
      ctx.fillRect(lx - 0.065, -0.8 + by, 0.13, 0.8 - by - up);
      ctx.fillStyle = p.shoes;
      rr(lx - 0.075, -up - 0.05, 0.15, 0.06, 0.02);
    }

    // Bags
    if (p.bag === 'stripes') {
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.02;
      ctx.beginPath(); ctx.moveTo(0.17, -1.38 + by); ctx.lineTo(0.3, -1.06 + by); ctx.stroke();
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0.19, -1.06 + by, 0.27, 0.3);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 ? '#2a4bd7' : '#d92b2b';
        ctx.fillRect(0.2 + i * 0.055, -1.06 + by, 0.025, 0.3);
      }
    } else if (p.bag === 'tote') {
      ctx.strokeStyle = '#8c7a5a'; ctx.lineWidth = 0.02;
      ctx.beginPath(); ctx.moveTo(0.17, -1.38 + by); ctx.lineTo(0.28, -1.02 + by); ctx.stroke();
      ctx.fillStyle = '#d8c8a4'; rr(0.2, -1.02 + by, 0.2, 0.26, 0.02);
    }

    // Torso
    ctx.fillStyle = p.coat;
    rr(-0.22, -1.42 + by, 0.44, 0.66, 0.08);
    if (p.kind === 'office') {
      ctx.fillStyle = '#f5f5f5';
      ctx.beginPath(); ctx.moveTo(-0.07, -1.42 + by); ctx.lineTo(0.07, -1.42 + by); ctx.lineTo(0, -1.22 + by); ctx.fill();
      ctx.fillStyle = p.tie;
      ctx.fillRect(-0.015, -1.4 + by, 0.03, 0.2);
    } else if (p.bag === 'backpack') {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-0.16, -1.42 + by, 0.05, 0.38);
      ctx.fillRect(0.11, -1.42 + by, 0.05, 0.38);
    }

    // Arms bent up, holding the phone at chest height
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, c] of [[0.12, 'rgba(0,0,0,0.35)'], [0.09, p.coat]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(-0.2, -1.36 + by); ctx.lineTo(-0.21, -1.1 + by); ctx.lineTo(-0.05, -1.18 + by);
      ctx.moveTo(0.2, -1.36 + by); ctx.lineTo(0.21, -1.1 + by); ctx.lineTo(0.05, -1.18 + by);
      ctx.stroke();
    }

    // Phone (we see the back of it) and hands
    ctx.fillStyle = p.phone;
    rr(-0.05, -1.3 + by, 0.1, 0.16, 0.015);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ellipse(-0.025, -1.27 + by, 0.012, 0.012);
    ctx.fillStyle = p.skin;
    ellipse(-0.05, -1.18 + by, 0.035, 0.035);
    ellipse(0.05, -1.18 + by, 0.035, 0.035);

    // Neck
    ctx.fillStyle = p.skin;
    ctx.fillRect(-0.045, -1.49 + by, 0.09, 0.09);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(-0.045, -1.49 + by, 0.09, 0.03);

    // Head, tilted down at the phone
    ctx.save();
    ctx.translate(0, -1.57 + by);
    ctx.rotate(p.tilt);
    if (p.longHair) { ctx.fillStyle = p.hair; rr(-0.13, -0.05, 0.26, 0.2, 0.06); }
    ctx.fillStyle = p.skin;
    ellipse(0, 0, 0.1, 0.12);
    ctx.fillStyle = 'rgba(150,200,255,0.14)';   // phone glow on the face
    ellipse(0, 0.05, 0.09, 0.07);

    // Looking down: lots of hair, little face
    ctx.fillStyle = p.hair;
    ctx.beginPath(); ctx.ellipse(0, -0.005, 0.112, 0.118, 0, Math.PI, 0); ctx.fill();
    if (p.kind === 'auntie') {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        ellipse(Math.cos(a) * 0.105, -0.01 + Math.sin(a) * 0.11, 0.035, 0.035);
      }
    }

    // Downcast eyes
    ctx.strokeStyle = '#2a1d17'; ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.arc(-0.04, 0.005, 0.02, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.moveTo(0.06, 0.012);
    ctx.arc(0.04, 0.005, 0.02, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    if (p.glasses) {
      // A mask plus glasses means foggy lenses. Classic.
      ctx.fillStyle = p.mask ? 'rgba(235,240,245,0.75)' : 'rgba(140,200,255,0.35)';
      rr(-0.075, -0.014, 0.064, 0.042, 0.01);
      rr(0.011, -0.014, 0.064, 0.042, 0.01);
      ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 0.01;
      ctx.strokeRect(-0.075, -0.014, 0.064, 0.042);
      ctx.strokeRect(0.011, -0.014, 0.064, 0.042);
      ctx.beginPath(); ctx.moveTo(-0.011, 0.002); ctx.lineTo(0.011, 0.002); ctx.stroke();
    }

    if (p.mask) {
      ctx.fillStyle = p.mask;
      rr(-0.085, 0.035, 0.17, 0.085, 0.03);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.006;
      ctx.beginPath();
      ctx.moveTo(-0.07, 0.065); ctx.lineTo(0.07, 0.065);
      ctx.moveTo(-0.07, 0.09); ctx.lineTo(0.07, 0.09);
      ctx.stroke();
      ctx.strokeStyle = p.mask === '#202020' ? '#202020' : '#e8e8e8'; ctx.lineWidth = 0.008;
      ctx.beginPath();
      ctx.moveTo(-0.085, 0.045); ctx.lineTo(-0.1, 0.0);
      ctx.moveTo(0.085, 0.045); ctx.lineTo(0.1, 0.0);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#8a4b3f'; ctx.lineWidth = 0.01;
      ctx.beginPath(); ctx.moveTo(-0.015, 0.075); ctx.lineTo(0.015, 0.075); ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  // ---------- Drawing the street ----------
  const HAZE = '58,32,74';
  const fogAlpha = (z) => clamp((z - 12) / (Z_FAR - 12), 0, 0.92);

  function quad(x1, y1, x2, y2, x3, y3, x4, y4) {
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }

  function groundQuad(xa, xb, za, zb) {
    quad(sx(xa, za), sy(0, za), sx(xb, za), sy(0, za), sx(xb, zb), sy(0, zb), sx(xa, zb), sy(0, zb));
  }

  function drawSky() {
    const hy = HORIZON + bob;
    const g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, '#07041a');
    g.addColorStop(0.55, '#2a0f45');
    g.addColorStop(1, '#a3366b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, hy + 1);

    const shift = -camX * 4;
    for (const b of skyline) {
      ctx.fillStyle = '#1b1030';
      ctx.fillRect(b.x + shift, hy - b.h, b.w, b.h + 1);
      ctx.fillStyle = 'rgba(255,207,122,0.7)';
      for (const [lx, ly] of b.lights) ctx.fillRect(b.x + shift + lx, hy - ly, 1.5, 1.5);
    }
  }

  function drawGround() {
    const hy = HORIZON + bob, zf = Z_FAR + 20;
    ctx.fillStyle = '#34303d';
    ctx.fillRect(0, hy, W, H - hy);

    ctx.fillStyle = '#1f1e26';
    groundQuad(-ROAD_HALF, ROAD_HALF, Z_CLIP, zf);

    // Pavement slabs scrolling past
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath();
    const P = 2.5;
    for (let z = P - (scroll % P); z < 40; z += P) {
      if (z < Z_CLIP) continue;
      const y = sy(0, z);
      for (const side of [-1, 1]) { ctx.moveTo(sx(side * ROAD_HALF, z), y); ctx.lineTo(sx(side * WALL_X, z), y); }
    }
    ctx.stroke();

    // Kerbs
    ctx.fillStyle = '#9b97a6';
    groundQuad(-ROAD_HALF - 0.15, -ROAD_HALF, Z_CLIP, zf);
    groundQuad(ROAD_HALF, ROAD_HALF + 0.15, Z_CLIP, zf);

    // Lane dashes
    ctx.fillStyle = 'rgba(230,228,215,0.85)';
    const D = 6, L = 2.6, off = scroll % D;
    for (let i = 1; i < LANES; i++) {
      const x = laneX(i) - LANE_W / 2;
      for (let z = -off; z < Z_FAR; z += D) {
        const za = Math.max(z, Z_CLIP), zb = z + L;
        if (zb <= Z_CLIP) continue;
        groundQuad(x - 0.06, x + 0.06, za, zb);
      }
    }

    // Haze hides the far end of the road
    const g = ctx.createLinearGradient(0, hy - 2, 0, hy + 70);
    g.addColorStop(0, `rgba(${HAZE},0.95)`);
    g.addColorStop(1, `rgba(${HAZE},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, hy - 2, W, 72);
  }

  function drawWall(b) {
    const x = b.side * WALL_X;
    const z1 = Math.max(b.z1, Z_CLIP), z2 = Math.min(b.z2, Z_FAR + 20);
    if (z1 >= z2) return;
    const ax = sx(x, z1), bx = sx(x, z2);
    const a0 = sy(0, z1), aT = sy(b.h, z1), b0 = sy(0, z2), bT = sy(b.h, z2);
    ctx.fillStyle = b.color;
    quad(ax, a0, ax, aT, bx, bT, bx, b0);

    if (z1 < 45) {
      const len = b.z2 - b.z1;
      for (let c = 0; c < b.cols; c++) {
        const wz1 = b.z1 + ((c + 0.2) / b.cols) * len, wz2 = b.z1 + ((c + 0.8) / b.cols) * len;
        if (wz1 < Z_CLIP) continue;
        const x1 = sx(x, wz1), x2 = sx(x, wz2);
        for (let r = 0; r < b.rows; r++) {
          const yb = r * 3 + 1.2, yt = yb + 1.4;
          if (sy(yb, wz1) < 0 && sy(yb, wz2) < 0) break;
          const col = b.lit[c * b.rows + r];
          if (!col) continue;
          ctx.fillStyle = col;
          quad(x1, sy(yb, wz1), x1, sy(yt, wz1), x2, sy(yt, wz2), x2, sy(yb, wz2));
        }
      }
    }

    const fa = fogAlpha((z1 + z2) / 2);
    if (fa > 0.01) {
      ctx.fillStyle = `rgba(${HAZE},${fa})`;
      quad(ax, a0, ax, aT, bx, bT, bx, b0);
    }
    if (b.z1 >= Z_CLIP) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, a0); ctx.lineTo(ax, aT); ctx.stroke();
    }
  }

  function drawSign(s) {
    if (s.z > Z_FAR + 5) return;
    const l = sx(s.xc - s.w / 2, s.z), r = sx(s.xc + s.w / 2, s.z);
    const top = sy(s.y + s.h, s.z), bot = sy(s.y, s.z);
    if (r < 0 || l > W || bot < 0) return;
    const sc = F / s.z;
    const on = !(s.flicker && Math.sin(time * 19 + s.seed) > 0.8);

    ctx.fillStyle = '#12060f';
    ctx.fillRect(l, top, r - l, bot - top);
    if (on) {
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = 0.3; ctx.lineWidth = Math.max(2, sc * 0.14);
      ctx.strokeRect(l, top, r - l, bot - top);
      ctx.globalAlpha = 1; ctx.lineWidth = Math.max(1, sc * 0.04);
      ctx.strokeRect(l, top, r - l, bot - top);
    } else {
      ctx.strokeStyle = '#3a2a33'; ctx.lineWidth = Math.max(1, sc * 0.04);
      ctx.strokeRect(l, top, r - l, bot - top);
    }

    const fs = sc * 0.55;
    if (fs >= 5) {
      ctx.fillStyle = on ? s.color : '#3a2a33';
      ctx.font = `bold ${fs.toFixed(1)}px ${CJK}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const chars = [...s.text];
      chars.forEach((ch, i) => {
        if (s.vertical) ctx.fillText(ch, (l + r) / 2, top + (0.225 + 0.36 + 0.72 * i) * sc);
        else ctx.fillText(ch, l + (0.25 + 0.375 + 0.75 * i) * sc, (top + bot) / 2);
      });
    }

    const fa = fogAlpha(s.z) * 0.8;
    if (fa > 0.01) {
      ctx.fillStyle = `rgba(${HAZE},${fa})`;
      ctx.fillRect(l, top, r - l, bot - top);
    }
  }

  // ---------- Text helpers ----------
  function glowText(text, x, y, font, color, blur) {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = color; ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function wrapText(text, x, y, maxW, lineH, font, color) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const words = text.split(' ');
    let line = '', yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lineH; }
      else line = test;
    }
    ctx.fillText(line, x, yy);
  }

  // ---------- Crash effects ----------
  function makeCracks() {
    const cx = W / 2 + rand(-40, 40), cy = H * 0.42 + rand(-30, 30);
    const rays = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2), x = cx, y = cy;
      const pts = [[x, y]], len = rand(150, 340);
      for (let j = 0; j < 4; j++) {
        a += rand(-0.35, 0.35);
        x += Math.cos(a) * len / 4; y += Math.sin(a) * len / 4;
        pts.push([x, y]);
      }
      rays.push(pts);
    }
    const rings = [24, 58].map((rad) => {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * Math.PI * 2, rr2 = rad + rand(-6, 6);
        pts.push([cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2]);
      }
      return pts;
    });
    return { cx, cy, rays, rings };
  }

  function drawCracks(c, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const pts of c.rays.concat(c.rings)) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ellipse(c.cx, c.cy, 5, 5);
    ctx.restore();
  }

  function drawFlyingPhone(ph) {
    ctx.save();
    ctx.translate(ph.x, ph.y);
    ctx.rotate(ph.r);
    const w = ph.size, h = ph.size * 1.6;
    const screenSide = Math.cos(ph.r * 1.3) > 0;
    ctx.fillStyle = screenSide ? '#0d0d0d' : ph.color;
    rr(-w / 2, -h / 2, w, h, w * 0.15);
    if (screenSide) {
      ctx.fillStyle = '#7fd8ff';
      rr(-w / 2 + w * 0.08, -h / 2 + w * 0.12, w * 0.84, h - w * 0.24, w * 0.08);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, -h * 0.35); ctx.lineTo(w * 0.05, -h * 0.05); ctx.lineTo(w * 0.35, h * 0.3);
      ctx.moveTo(w * 0.05, -h * 0.05); ctx.lineTo(-w * 0.25, h * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Game state ----------
  function loadBest() { try { return parseInt(localStorage.getItem('pzBest'), 10) || 0; } catch (e) { return 0; } }
  function saveBest(v) { try { localStorage.setItem('pzBest', String(v)); } catch (e) { /* storage blocked */ } }

  let state = 'ready';   // ready | playing | paused | crash | over
  let dist = 0, speed = START_SPEED, best = loadBest(), newBest = false;
  let targetLane = 1, rowTimer = 0.3, walkPhase = 0, crashT = 0, overT = 0, time = 0;
  let crash = null, msg = '';

  function start() {
    peds = peds.filter((p) => p.z > 20);
    dist = 0; speed = START_SPEED; newBest = false; crash = null;
    rowTimer = 0.8;
    state = 'playing';
    canvas.style.touchAction = 'none';
  }

  function spawnRow() {
    const playing = state === 'playing';
    const diff = Math.min(1, dist / 1200);
    let n = 1;
    if (playing) {
      const r = Math.random();
      n = r < 0.6 - diff * 0.45 ? 1 : r < 0.93 - diff * 0.25 ? 2 : 3;
    }
    let lanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    if (!playing) lanes = lanes.filter((l) => l !== targetLane);
    lanes.slice(0, n).forEach((l) => peds.push(makePed(l, Z_FAR + rand(-1.5, 1.5))));
    let gap = playing ? lerp(1.15, 0.55, diff) * rand(0.85, 1.25) : rand(1.2, 2.2);
    if (n === 3) gap = Math.max(gap, 0.85);
    rowTimer = gap;
  }

  function hit(p) {
    state = 'crash'; crashT = 0; overT = 0;
    const score = Math.floor(dist);
    newBest = score > best;
    if (newBest) { best = score; saveBest(best); }
    msg = pick(MESSAGES);
    crash = {
      cracks: makeCracks(),
      phone: { x: sx(p.x, p.z), y: sy(1.2 * p.h / 1.7, p.z), vx: rand(-150, 150), vy: -650,
        r: 0, vr: rand(-14, 14), color: p.phone, size: (F / p.z) * 0.1 },
    };
    canvas.style.touchAction = '';
    try { if (navigator.vibrate) navigator.vibrate(150); } catch (e) { /* not supported */ }
  }

  function update(dt) {
    time += dt;
    const moving = state === 'playing' || state === 'ready';
    if (state === 'playing') {
      speed = Math.min(MAX_SPEED, START_SPEED + dist * 0.009);
      dist += speed * dt;
    }
    const v = state === 'playing' ? speed : state === 'ready' ? 2.2 : 0;
    moveScenery(v * dt);
    walkPhase += dt * (moving ? 4 + v * 0.55 : 0);

    if (moving) {
      rowTimer -= dt;
      if (rowTimer <= 0) spawnRow();
      for (const p of peds) { p.z -= (v + PED_SPEED) * dt; p.phase += dt * 7.5; }
    }

    camX += (laneX(targetLane) - camX) * (1 - Math.exp(-dt * 16));
    bob = moving ? Math.sin(walkPhase) * (state === 'playing' ? 2.2 : 1) : bob * 0.9;

    if (state === 'playing') {
      for (const p of peds) {
        if (!p.checked && p.z <= HIT_Z) {
          p.checked = true;
          if (Math.abs(p.x - camX) < HIT_X) { hit(p); break; }
        }
      }
    }
    if (state !== 'crash' && state !== 'over') peds = peds.filter((p) => p.z > 0.7);

    if (state === 'crash') {
      crashT += dt;
      const ph = crash.phone;
      ph.vy += 1400 * dt; ph.x += ph.vx * dt; ph.y += ph.vy * dt; ph.r += ph.vr * dt;
      if (crashT > 1.0) state = 'over';
    } else if (state === 'over') {
      overT += dt;
    }
  }

  // ---------- Rendering ----------
  function drawHUD() {
    ctx.save();
    ctx.font = `13px ${PIXEL}`;
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillStyle = '#00ffff'; ctx.textAlign = 'left';
    ctx.fillText(`${Math.floor(dist)} m`, 12, 12);
    ctx.fillStyle = '#ffe600'; ctx.textAlign = 'right';
    ctx.fillText(`BEST ${best}`, W - 12, 12);
    ctx.restore();
  }

  const blink = () => Math.sin(time * 6) > -0.2;

  function drawReady() {
    ctx.fillStyle = 'rgba(5,0,15,0.5)';
    ctx.fillRect(0, 0, W, H);
    glowText('低頭族', W / 2, 140, `900 56px ${CJK}`, '#ff2a3d', 22);
    glowText('DASH', W / 2, 200, `26px ${PIXEL}`, '#00ffff', 14);
    wrapText("Dodge Hong Kong's phone zombies", W / 2, 245, W - 40, 20, 'bold 16px Arial, sans-serif', '#ffffff');
    wrapText('← → or A / D to sidestep', W / 2, 300, W - 40, 20, '14px Arial, sans-serif', '#c9c3d6');
    wrapText('On a phone? Tap the left or right side', W / 2, 322, W - 40, 20, '14px Arial, sans-serif', '#c9c3d6');
    if (best > 0) glowText(`BEST ${best} m`, W / 2, 370, `12px ${PIXEL}`, '#ffe600', 6);
    if (blink()) glowText('TAP OR PRESS SPACE', W / 2, H - 70, `12px ${PIXEL}`, '#ffffff', 8);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(5,0,15,0.6)';
    ctx.fillRect(0, 0, W, H);
    glowText('PAUSED', W / 2, H / 2 - 20, `22px ${PIXEL}`, '#00ffff', 12);
    wrapText('Tap or press Space to keep walking', W / 2, H / 2 + 20, W - 40, 20, '14px Arial, sans-serif', '#ffffff');
  }

  function drawOver() {
    const a = clamp(overT / 0.4, 0, 1);
    ctx.fillStyle = `rgba(25,0,6,${0.8 * a})`;
    ctx.fillRect(0, 0, W, H);
    drawCracks(crash.cracks, 0.5 * a);
    ctx.save();
    ctx.globalAlpha = a;
    glowText('撞到了！', W / 2, 120, `900 46px ${CJK}`, '#ff2a3d', 18);
    glowText('GAME OVER', W / 2, 172, `16px ${PIXEL}`, '#ffffff', 8);
    wrapText(msg, W / 2, 214, W - 60, 20, 'italic 15px Georgia, serif', '#ffd7dc');
    glowText('DISTANCE', W / 2, 282, `10px ${PIXEL}`, '#c9c3d6', 0);
    glowText(`${Math.floor(dist)} m`, W / 2, 310, `24px ${PIXEL}`, '#00ffff', 12);
    glowText(`BEST ${best} m`, W / 2, 348, `11px ${PIXEL}`, '#ffe600', 6);
    if (newBest && blink()) glowText('NEW BEST!', W / 2, 382, `14px ${PIXEL}`, '#ffe600', 12);
    if (overT > 0.6 && blink()) glowText('TAP TO TRY AGAIN', W / 2, H - 60, `12px ${PIXEL}`, '#ffffff', 8);
    ctx.restore();
  }

  function render() {
    ctx.save();
    if (state === 'crash') {
      const sh = Math.max(0, 1 - crashT * 1.4) * 12;
      ctx.translate(rand(-sh, sh), rand(-sh, sh));
    }
    ctx.fillStyle = '#07041a';
    ctx.fillRect(-20, -20, W + 40, H + 40);
    drawSky();
    drawGround();
    buildings.slice().sort((a, b) => b.z1 - a.z1).forEach(drawWall);
    for (let i = signs.length - 1; i >= 0; i--) drawSign(signs[i]);
    peds.slice().sort((a, b) => b.z - a.z).forEach(drawPed);
    ctx.restore();

    if (state === 'crash') {
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.85 - crashT * 3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(160,0,20,${Math.min(0.35, crashT * 0.6)})`;
      ctx.fillRect(0, 0, W, H);
      if (crashT > 0.05) drawCracks(crash.cracks, 0.9);
      drawFlyingPhone(crash.phone);
    }

    if (state === 'playing' || state === 'crash' || state === 'paused') drawHUD();
    if (state === 'ready') drawReady();
    else if (state === 'paused') drawPaused();
    else if (state === 'over') drawOver();
  }

  // ---------- Loop, sizing, pause ----------
  let last = 0, rafId = 0, visible = true;

  function frame(ts) {
    rafId = 0;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
    last = ts;
    update(dt);
    render();
    if (visible && !document.hidden) rafId = requestAnimationFrame(frame);
  }

  function kick() {
    if (!rafId && visible && !document.hidden) { last = 0; rafId = requestAnimationFrame(frame); }
  }

  function pause() {
    if (state === 'playing') { state = 'paused'; canvas.style.touchAction = ''; render(); }
  }

  function fit() {
    const cssW = canvas.clientWidth || W;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = (cssW * dpr) / W;
    const w = Math.round(W * scale), h = Math.round(H * scale);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (!rafId) render();
  }

  // ---------- Input ----------
  function press(dir) {
    if (state === 'playing') {
      if (dir) targetLane = clamp(targetLane + dir, 0, LANES - 1);
      return;
    }
    if (state === 'paused') { state = 'playing'; canvas.style.touchAction = 'none'; kick(); return; }
    if (state === 'crash') return;
    if (state === 'over' && overT < 0.6) return;   // stops frantic taps restarting instantly
    start();
    kick();
  }

  window.addEventListener('keydown', (e) => {
    let dir = null;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') dir = -1;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dir = 1;
    else if (e.key === ' ' || e.key === 'Enter') dir = 0;
    if (dir === null) return;
    // Only grab keys while playing, or when the game has focus, so page scrolling still works.
    if (state !== 'playing' && document.activeElement !== canvas) return;
    if (e.repeat && state !== 'playing') return;
    e.preventDefault();
    press(dir);
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { canvas.focus({ preventScroll: true }); } catch (err) { canvas.focus(); }
    const rect = canvas.getBoundingClientRect();
    press(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
    if (state === 'playing') e.preventDefault();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) kick(); else pause();
    }, { threshold: 0.25 }).observe(canvas);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else kick(); });
  window.addEventListener('resize', fit);

  // ---------- Go ----------
  initScenery();
  for (const z of [16, 31, 46]) {
    const lanes = [0, 1, 2, 3].filter((l) => l !== targetLane);
    peds.push(makePed(pick(lanes), z));
  }
  fit();
  kick();
})();
