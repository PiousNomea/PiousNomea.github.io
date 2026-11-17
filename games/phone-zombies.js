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
  const START_SPEED = 6, MAX_SPEED = 22;
  const RESTART_DELAY = 0.45;                       // seconds before a tap can restart after a crash
  const MILESTONE = 200, MILESTONE_BOOST = 0.6;    // +0.6 m/s every 200 m
  const TYPHOON_TIME = 6, TYPHOON_PED_BOOST = 3.5;  // seconds; extra walking speed in a storm
  const PICKUP_CHANCE = 0.12;                       // per row of pedestrians

  const PIXEL = "'Press Start 2P', monospace";
  const CJK = "'PingFang HK','Noto Sans HK','Noto Sans CJK TC','Microsoft JhengHei',sans-serif";

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const chance = (p) => Math.random() < p;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const laneX = (i) => (i - (LANES - 1) / 2) * LANE_W;

  let camX = laneX(1), bob = 0, sway = 0;
  const sx = (x, z) => W / 2 + sway + (x - camX) * F / z;
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
  const UMBRELLAS = ['#1f6feb', '#e63946', '#2a9d8f', '#f4a261', '#1a1a1a', '#8338ec',
    'rgba(225,238,255,0.55)', 'rgba(225,238,255,0.55)'];   // clear umbrellas are very HK

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
  const TYPHOON_MESSAGES = [
    'Signal 8 and you still went out?',
    'Her umbrella survived. You did not.',
    'Blown into an auntie at 120 km/h.',
    'The Observatory did warn you.',
    "He didn't look up. Not even for a typhoon.",
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
      umbrella: pick(UMBRELLAS),
      insideOut: chance(0.15),
      seed: rand(0, 100),
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
    const uk = typhoonK;   // 0 = calm, 1 = full typhoon (umbrella open)
    if (uk > 0.01) ctx.rotate((Math.sin(time * 7 + p.seed) * 0.05 - 0.05) * uk);   // battling the wind
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

    // Arms: left hand always on the phone; in a typhoon the right hand
    // leaves the phone and goes up to hold the umbrella.
    const rex = lerp(0.21, 0.33, uk), rey = lerp(-1.1, -1.3, uk) + by;
    const rhx = lerp(0.05, 0.27, uk), rhy = lerp(-1.18, -1.52, uk) + by;
    const phx = -0.05 - 0.03 * uk;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, c] of [[0.12, 'rgba(0,0,0,0.35)'], [0.09, p.coat]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(-0.2, -1.36 + by); ctx.lineTo(-0.21, -1.1 + by); ctx.lineTo(phx, -1.18 + by);
      ctx.moveTo(0.2, -1.36 + by); ctx.lineTo(rex, rey); ctx.lineTo(rhx, rhy);
      ctx.stroke();
    }

    // Phone (we see the back of it) and hands
    ctx.fillStyle = p.phone;
    rr(phx, -1.3 + by, 0.1, 0.16, 0.015);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ellipse(phx + 0.025, -1.27 + by, 0.012, 0.012);
    ctx.fillStyle = p.skin;
    ellipse(phx, -1.18 + by, 0.035, 0.035);
    if (uk < 0.5) ellipse(rhx, rhy, 0.035, 0.035);

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

    if (uk > 0.05) {
      drawUmbrella(p, rhx, rhy, uk);
      ctx.fillStyle = p.skin;
      ellipse(rhx, rhy, 0.035, 0.035);   // hand gripping the handle
    }
    ctx.restore();
  }

  function drawUmbrella(p, hx, hy, k) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-0.35 + Math.sin(time * 9 + p.seed) * 0.12);   // tilted into the wind and shaking
    const len = 0.55, r = 0.52 * k;

    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.022; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0.06); ctx.lineTo(0, -len); ctx.stroke();
    ctx.beginPath(); ctx.arc(0.03, 0.06, 0.03, Math.PI, 0, true); ctx.stroke();   // J handle

    ctx.translate(0, -len);
    ctx.fillStyle = p.umbrella;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.01;
    ctx.beginPath();
    if (p.insideOut && k > 0.6) {
      // Blown inside out, as umbrellas do in a signal 8
      ctx.moveTo(-r, -0.32 * k);
      ctx.quadraticCurveTo(0, 0.12, r, -0.32 * k);
      ctx.quadraticCurveTo(0, -0.04, -r, -0.32 * k);
      ctx.fill();
      ctx.beginPath();
      for (const t of [-1, -0.5, 0.5, 1]) { ctx.moveTo(0, 0.02); ctx.lineTo(t * r, -0.3 * k); }
      ctx.stroke();
    } else {
      ctx.ellipse(0, 0, r, r * 0.62, 0, Math.PI, 0);
      const n = 4, seg = (2 * r) / n;
      for (let i = 0; i < n; i++) {
        const x2 = r - (i + 1) * seg;
        ctx.quadraticCurveTo(x2 + seg / 2, -0.06 * k, x2, 0);
      }
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { ctx.moveTo(0, -r * 0.62); ctx.lineTo(-r + i * seg, 0); }
      ctx.stroke();
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.02;
      ctx.beginPath(); ctx.moveTo(0, -r * 0.62); ctx.lineTo(0, -r * 0.62 - 0.06); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Typhoon power-up ----------
  let pickups = [];

  function drawPickup(pk) {
    const s = F / pk.z;
    const lift = 1.0 + Math.sin(time * 3 + pk.z) * 0.08;
    const px = sx(pk.x, pk.z), py = sy(lift, pk.z);
    if (px < -s || px > W + s || py > H + s) return;
    ctx.save();
    ctx.globalAlpha = clamp((Z_FAR + 1 - pk.z) / 8, 0, 1);
    ctx.translate(px, py);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ellipse(0, lift, 0.25, 0.05);                         // shadow on the road
    ctx.fillStyle = `rgba(0,229,255,${0.15 + 0.1 * Math.sin(time * 6)})`;
    ellipse(0, 0, 0.45, 0.45);                            // pulsing glow
    ctx.fillStyle = '#0b1a3a';
    ellipse(0, 0, 0.3, 0.3);
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.save();                                           // spinning cyclone
    ctx.rotate(-time * 5);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.045; ctx.lineCap = 'round';
    for (const a of [0, Math.PI]) { ctx.beginPath(); ctx.arc(0, 0, 0.17, a, a + 2.1); ctx.stroke(); }
    ctx.fillStyle = '#ffffff';
    ellipse(0, 0, 0.05, 0.05);
    ctx.restore();
    ctx.fillStyle = '#ffd400';                            // the No. 8 signal triangle
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.02;
    ctx.beginPath(); ctx.moveTo(0, -0.58); ctx.lineTo(0.14, -0.36); ctx.lineTo(-0.14, -0.36); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---------- Storm effects ----------
  const WIND = -260;
  const rain = Array.from({ length: 150 }, () => ({
    x: rand(0, W + 150), y: rand(-H, H), len: rand(10, 22), spd: rand(700, 1000),
  }));
  const debris = Array.from({ length: 7 }, () => ({
    x: rand(0, W), y: rand(0, H * 0.8), vx: rand(-420, -250), vy: rand(-40, 60),
    r: rand(0, 6), vr: rand(-8, 8), size: rand(3, 6), c: pick(['#5f8f3a', '#8a6a3a', '#d8d2c0', '#7aa04a']),
  }));
  let flashA = 0;

  function updateStorm(dt) {
    if (typhoonK < 0.01) return;
    for (const d of rain) {
      d.y += d.spd * dt; d.x += WIND * dt;
      if (d.y > H || d.x < -30) { d.y = rand(-40, 0); d.x = rand(0, W + 150); }
    }
    for (const d of debris) {
      d.x += d.vx * dt; d.y += d.vy * dt + Math.sin(time * 5 + d.r) * 40 * dt; d.r += d.vr * dt;
      if (d.x < -20) { d.x = W + 20; d.y = rand(0, H * 0.8); }
    }
  }

  function drawStorm() {
    const k = typhoonK;
    if (k > 0.01) {
      ctx.fillStyle = `rgba(10,20,40,${0.38 * k})`;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = `rgba(190,210,255,${0.55 * k})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of rain) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - (WIND / d.spd) * d.len, d.y - d.len);
      }
      ctx.stroke();
      if (k > 0.3) {
        for (const d of debris) {
          ctx.save();
          ctx.globalAlpha = k;
          ctx.translate(d.x, d.y); ctx.rotate(d.r);
          ctx.fillStyle = d.c;
          ellipse(0, 0, d.size, d.size * 0.45);
          ctx.restore();
        }
      }
    }
    if (flashA > 0.01) {
      ctx.fillStyle = `rgba(230,240,255,${flashA})`;
      ctx.fillRect(0, 0, W, H);
    }
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
    const flickery = s.flicker || (typhoonK > 0.5 && s.seed > 55);   // storms knock the signs about
    const on = !(flickery && Math.sin(time * 19 + s.seed) > 0.8 - typhoonK * 0.5);

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
  // These take an optional context so they can draw on the share card too.
  function glowText(text, x, y, font, color, blur, g = ctx) {
    g.save();
    g.font = font;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = blur;
    g.fillStyle = color;
    g.fillText(text, x, y);
    g.restore();
  }

  function wrapText(text, x, y, maxW, lineH, font, color, g = ctx) {
    g.font = font;
    g.fillStyle = color;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const words = text.split(' ');
    let line = '', yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); line = w; yy += lineH; }
      else line = test;
    }
    g.fillText(line, x, yy);
    return yy;
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

  function drawCracks(c, alpha, g = ctx) {
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1.2;
    g.beginPath();
    for (const pts of c.rays.concat(c.rings)) {
      g.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath(); g.ellipse(c.cx, c.cy, 5, 5, 0, 0, Math.PI * 2); g.fill();
    g.restore();
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

  // ---------- Sound: everything synthesised with Web Audio, no audio files ----------
  const audio = (() => {
    let ac = null, master, musicBus, sfxBus, noiseBuf, windGain, windFilter, rainGain;
    let muted = false;
    try { muted = localStorage.getItem('pzMuted') === '1'; } catch (e) { /* storage blocked */ }
    let musicOn = false, step = 0, nextStep = 0, tempo = 128, leadVol = 1;

    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ac.destination);
      musicBus = ac.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.6; sfxBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      // Storm ambience: looping wind and rain, silent until a typhoon
      const wind = ac.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
      windFilter = ac.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 400; windFilter.Q.value = 0.8;
      windGain = ac.createGain(); windGain.gain.value = 0;
      wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(sfxBus); wind.start();
      const rain = ac.createBufferSource(); rain.buffer = noiseBuf; rain.loop = true;
      const rf = ac.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 2500;
      rainGain = ac.createGain(); rainGain.gain.value = 0;
      rain.connect(rf); rf.connect(rainGain); rainGain.connect(sfxBus); rain.start();

      // iOS only allows speech after a tap, so unlock it now
      try { if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) { /* no speech */ }
    }

    function tone(freq, t, dur, type, vol, bus, slideTo) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus || sfxBus);
      o.start(t); o.stop(t + dur + 0.03);
    }

    function noise(t, dur, vol, type, freq, bus, q) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(bus || sfxBus);
      s.start(t, Math.random()); s.stop(t + dur + 0.03);
      return f;
    }

    // Original theme: an upbeat pentatonic tune in eighth notes (semitones above C4)
    const MEL_A = [12, null, 9, 7, 9, null, 12, 14, 16, null, 14, 12, 9, null, 7, null,
      9, null, 7, 4, 7, null, 9, 12, 9, null, 7, 4, 2, null, 0, null];
    const MEL_B = [7, 9, 12, null, 12, 14, 16, null, 19, null, 16, 14, 12, null, 14, null,
      16, 14, 12, 9, 12, null, 9, 7, 9, null, 12, null, 7, null, null, null];
    const BASS = [36, 33, 29, 31];   // C, A, F, G

    function scheduleStep(t) {
      const eighth = 60 / tempo / 2;
      const mel = Math.floor(step / 32) % 2 === 0 ? MEL_A : MEL_B;
      const n = mel[step % 32];
      if (n !== null) tone(midi(60 + n), t, eighth * 0.9, 'square', 0.14 * leadVol, musicBus);
      const beat = step % 8;
      const root = BASS[Math.floor(step / 8) % 4];
      if (beat % 2 === 0) tone(midi(root + (beat % 4 === 2 ? 12 : 0)), t, eighth * 1.6, 'triangle', 0.35, musicBus);
      if (beat === 0 || beat === 4) tone(150, t, 0.12, 'sine', 0.5, musicBus, 45);             // kick
      if (beat === 2 || beat === 6) noise(t, 0.09, 0.25, 'bandpass', 1800, musicBus, 0.6);     // snare
      if (beat % 2 === 1) noise(t, 0.03, 0.1, 'highpass', 7000, musicBus);                      // hi-hat
      if (step % 64 === 0) {                                                                    // station-style chime
        tone(midi(88), t, 0.5, 'sine', 0.16, musicBus);
        tone(midi(84), t + 0.25, 0.8, 'sine', 0.16, musicBus);
      }
      step++;
    }

    function tick(speed, storm) {
      if (!ac) return;
      const now = ac.currentTime;
      if (musicOn) {
        tempo = 128 + (speed - 6) * 3;          // music speeds up with you
        leadVol = storm > 0.5 ? 0.45 : 1;
        if (nextStep < now) nextStep = now + 0.05;
        while (nextStep < now + 0.15) { scheduleStep(nextStep); nextStep += 60 / tempo / 2; }
      }
      windGain.gain.setTargetAtTime(storm * 0.55, now, 0.25);
      rainGain.gain.setTargetAtTime(storm * 0.16, now, 0.25);
      windFilter.frequency.setTargetAtTime(320 + Math.sin(now * 1.7) * 160 + storm * 200, now, 0.1);
    }

    const sfx = {
      lane() {
        if (!ac) return;
        const t = ac.currentTime;
        const f = noise(t, 0.13, 0.22, 'bandpass', 700, sfxBus, 1.3);
        f.frequency.exponentialRampToValueAtTime(2600, t + 0.12);
      },
      doors() {   // MTR-style door-closing beeps at every speed-up
        if (!ac) return;
        const t = ac.currentTime;
        for (let i = 0; i < 5; i++) tone(1950, t + i * 0.16, 0.09, 'sine', 0.3);
      },
      pickup() {
        if (!ac) return;
        const t = ac.currentTime;
        [0, 4, 7, 12, 16].forEach((n, i) => tone(midi(72 + n), t + i * 0.06, 0.18, 'square', 0.18));
        noise(t, 1.0, 0.35, 'lowpass', 500);
      },
      thunder() {
        if (!ac) return;
        const t = ac.currentTime + rand(0.1, 0.4);
        noise(t, 1.8, 0.9, 'lowpass', 160);
        noise(t, 0.3, 0.4, 'lowpass', 900);
      },
      crash() {
        if (!ac) return;
        const t = ac.currentTime;
        tone(130, t, 0.35, 'sine', 0.9, sfxBus, 40);                     // thud
        noise(t, 0.15, 0.55, 'highpass', 2500);                         // screen cracks
        for (let i = 0; i < 6; i++) noise(t + 0.04 + i * 0.045, 0.05, 0.25, 'highpass', 5000);
        [67, 66, 65].forEach((n, i) => tone(midi(n), t + 0.55 + i * 0.3, 0.28, 'triangle', 0.3));
        tone(midi(64), t + 1.45, 0.9, 'triangle', 0.3, sfxBus, midi(62));   // sad trombone-ish ending
      },
    };

    // Cantonese lines use the device's Cantonese voice when it has one
    let hkVoice = null;
    function findVoice() {
      try {
        const vs = speechSynthesis.getVoices();
        hkVoice = vs.find((v) => /^(zh[-_]HK|yue)/i.test(v.lang)) ||
          vs.find((v) => /cantonese|粵|廣東/i.test(v.name)) || null;
      } catch (e) { hkVoice = null; }
    }
    if ('speechSynthesis' in window) {
      findVoice();
      if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', findVoice);
    }

    function say(text, pitch) {
      if (muted || !hkVoice) return;
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.voice = hkVoice; u.lang = hkVoice.lang; u.rate = 1.25; u.pitch = pitch || 1; u.volume = 1;
        speechSynthesis.speak(u);
      } catch (e) { /* no speech */ }
    }
    function hush() { try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) { /* ignore */ } }

    function setMuted(m) {
      muted = m;
      try { localStorage.setItem('pzMuted', m ? '1' : '0'); } catch (e) { /* storage blocked */ }
      if (ac) master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.02);
      if (m) hush();
    }

    return {
      init, tick, sfx, say, hush, setMuted,
      isMuted: () => muted,
      startMusic(fromTop) { if (fromTop) step = 0; nextStep = 0; musicOn = true; },
      stopMusic() { musicOn = false; },
    };
  })();

  // ---------- Analytics (works once a free GoatCounter script is on the page) ----------
  function track(name) {
    try {
      if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: 'game/' + name, title: name, event: true });
      }
    } catch (e) { /* analytics blocked */ }
  }

  // ---------- Game state ----------
  function loadBest() { try { return parseInt(localStorage.getItem('pzBest'), 10) || 0; } catch (e) { return 0; } }
  function saveBest(v) { try { localStorage.setItem('pzBest', String(v)); } catch (e) { /* storage blocked */ } }

  let state = 'ready';   // ready | playing | paused | crash | over
  let dist = 0, speed = START_SPEED, best = loadBest(), newBest = false;
  let targetLane = 1, rowTimer = 0.3, walkPhase = 0, crashT = 0, overT = 0, time = 0;
  let crash = null, msg = '';
  let typhoonT = 0, typhoonK = 0, level = 0, bannerT = 0, bannerText = '';
  let finalScore = 0, lastLineT = -9, bubble = null, reply = null, share = null;

  // What you say squeezing past someone, with how to say it for expats
  const PASS_LINES = [
    { text: '唔該借借！', sub: 'm4 goi1 ze3 ze3 · excuse me' },
    { text: '唔好意思！', sub: 'm4 hou2 ji3 si1 · sorry' },
    { text: '借借！', sub: 'ze3 ze3 · coming through' },
    { text: '唔該晒！', sub: 'm4 goi1 saai3 · thanks!' },
  ];
  const REPLY_LINES = [
    { text: '睇路啦！', sub: 'watch where you\'re going!' },
    { text: '咩呀你！', sub: 'what\'s your problem?!' },
    { text: '嘩！', sub: 'whoa!' },
  ];

  function start() {
    peds = peds.filter((p) => p.z > 20);
    pickups = [];
    dist = 0; speed = START_SPEED; newBest = false; crash = null;
    typhoonT = 0; typhoonK = 0; flashA = 0; level = 0; bannerT = 0;
    rowTimer = 0.8;
    bubble = null; reply = null; share = null; lastLineT = -9;
    state = 'playing';
    canvas.style.touchAction = 'none';
    showActions(false);
    audio.startMusic(true);
    track('start');
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
    // Sometimes a typhoon signal floats in one of the free lanes
    if (playing && dist > 150 && typhoonT <= 0 && !pickups.length && chance(PICKUP_CHANCE)) {
      const lane = pick(lanes.slice(n));
      pickups.push({ isPickup: true, lane, x: laneX(lane), z: Z_FAR, checked: false });
    }
    let gap = playing ? lerp(1.15, 0.55, diff) * rand(0.85, 1.25) : rand(1.2, 2.2);
    if (n === 3) gap = Math.max(gap, 0.85);
    rowTimer = gap;
  }

  function hit(p) {
    // Picture of the street at the moment of impact (no HUD or bubbles) for the share card
    let snapshot = null;
    try {
      renderWorld();
      snapshot = document.createElement('canvas');
      snapshot.width = canvas.width; snapshot.height = canvas.height;
      snapshot.getContext('2d').drawImage(canvas, 0, 0);
    } catch (e) { snapshot = null; }
    state = 'crash'; crashT = 0; overT = 0;
    const score = Math.floor(dist);
    newBest = score > best;
    if (newBest) { best = score; saveBest(best); }
    msg = pick(typhoonT > 0 ? TYPHOON_MESSAGES : MESSAGES);
    finalScore = score;
    bubble = null; reply = null;
    audio.stopMusic(); audio.hush(); audio.sfx.crash(); audio.say('哎呀！', 1.2);
    track('crash');
    track('distance-' + (score < 100 ? '0-99' : score < 250 ? '100-249' : score < 500 ? '250-499' : score < 1000 ? '500-999' : '1000plus'));
    crash = {
      snapshot,
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
      // Gentle ramp for the first 1000 m, plus a speed boost every 200 m
      level = Math.floor(dist / MILESTONE);
      speed = Math.min(MAX_SPEED, Math.min(11, START_SPEED + dist * 0.005) + level * MILESTONE_BOOST);
      dist += speed * dt * (typhoonT > 0 ? 2 : 1);   // typhoon = double distance
      const newLevel = Math.floor(dist / MILESTONE);
      if (newLevel > level) { bannerText = `${newLevel * MILESTONE} m`; bannerT = 1.6; audio.sfx.doors(); }

      if (typhoonT > 0) typhoonT = Math.max(0, typhoonT - dt);
      typhoonK += ((typhoonT > 0 ? 1 : 0) - typhoonK) * (1 - Math.exp(-dt * (typhoonT > 0 ? 5 : 2)));
      if (typhoonK < 0.005) typhoonK = 0;
      if (typhoonK > 0.6 && Math.random() < dt * 0.45) { flashA = rand(0.4, 0.7); audio.sfx.thunder(); }   // lightning
    }
    flashA = Math.max(0, flashA - dt * 2.5);
    bannerT = Math.max(0, bannerT - dt);
    if (bubble && (bubble.t -= dt) <= 0) bubble = null;
    if (reply && (reply.t -= dt) <= 0) reply = null;
    audio.tick(speed, typhoonK);
    updateStorm(dt);
    sway = Math.sin(time * 2.3) * 4 * typhoonK;

    const v = state === 'playing' ? speed : state === 'ready' ? 2.2 : 0;
    moveScenery(v * dt);
    walkPhase += dt * (moving ? 4 + v * 0.55 : 0);

    if (moving) {
      rowTimer -= dt;
      if (rowTimer <= 0) spawnRow();
      const pedV = PED_SPEED + TYPHOON_PED_BOOST * typhoonK;   // they rush in a storm
      for (const p of peds) { p.z -= (v + pedV) * dt; p.phase += dt * 7.5 * (1 + typhoonK * 0.7); }
      for (const pk of pickups) pk.z -= v * dt;
    }

    camX += (laneX(targetLane) - camX) * (1 - Math.exp(-dt * 16));
    bob = moving ? Math.sin(walkPhase) * (state === 'playing' ? 2.2 : 1) : bob * 0.9;

    if (state === 'playing') {
      for (const pk of pickups) {
        if (!pk.checked && pk.z <= HIT_Z) {
          pk.checked = true;
          if (Math.abs(pk.x - camX) < 0.8) { typhoonT = TYPHOON_TIME; flashA = 0.85; pk.z = 0; audio.sfx.pickup(); track('typhoon'); }
        }
      }
      for (const p of peds) {
        if (!p.checked && p.z <= HIT_Z) {
          p.checked = true;
          if (Math.abs(p.x - camX) < HIT_X) { hit(p); break; }
        }
      }
    }
    if (state === 'playing') {
      // Squeezing past someone in the next lane: say excuse me (and maybe get told off)
      for (const p of peds) {
        if (p.passed || p.z > 3.2) continue;
        p.passed = true;
        const dx = p.x - camX;
        if (Math.abs(dx) > HIT_X && Math.abs(dx) < 1.9 && time - lastLineT > 2.2 && chance(0.6)) {
          lastLineT = time;
          const side = Math.sign(dx) || 1;
          const line = pick(PASS_LINES);
          bubble = { ...line, side, t: 1.3 };
          audio.say(line.text, rand(0.9, 1.15));
          if (chance(0.35)) {
            const r = pick(REPLY_LINES);
            reply = { ...r, side, t: 1.4 };
            audio.say(r.text, 0.75);
          }
        }
      }
    }
    if (state !== 'crash' && state !== 'over') {
      peds = peds.filter((p) => p.z > 0.7);
      pickups = pickups.filter((pk) => pk.z > 0.7);
    }

    if (state === 'crash') {
      crashT += dt;
      const ph = crash.phone;
      ph.vy += 1400 * dt; ph.x += ph.vx * dt; ph.y += ph.vy * dt; ph.r += ph.vr * dt;
      if (crashT > 0.9) { state = 'over'; prepareShare(); }
    } else if (state === 'over') {
      const before = overT;
      overT += dt;
      if (before < RESTART_DELAY && overT >= RESTART_DELAY) showActions(true);
    }
  }

  // ---------- Speech bubbles ----------
  function drawBubble(b, x, y, tailDown, border) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, b.t / 0.25);
    ctx.font = `900 22px ${CJK}`;
    const w1 = ctx.measureText(b.text).width;
    ctx.font = 'bold 10px Arial, sans-serif';
    const w2 = ctx.measureText(b.sub).width;
    const w = Math.max(w1, w2) + 22, h = 50;
    const bx = clamp(x - w / 2, 6, W - w - 6), by = y - h / 2;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = border; ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 12); else ctx.rect(bx, by, w, h);
    ctx.fill(); ctx.stroke();
    const tx = clamp(x, bx + 16, bx + w - 16);
    ctx.beginPath();
    if (tailDown) { ctx.moveTo(tx - 7, by + h - 1); ctx.lineTo(tx, by + h + 10); ctx.lineTo(tx + 7, by + h - 1); }
    else { ctx.moveTo(tx - 7, by + 1); ctx.lineTo(tx, by - 10); ctx.lineTo(tx + 7, by + 1); }
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 22px ${CJK}`;
    ctx.fillText(b.text, bx + w / 2, by + 19);
    ctx.fillStyle = '#666';
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.fillText(b.sub, bx + w / 2, by + 39);
    ctx.restore();
  }

  function drawBubbles() {
    if (bubble) drawBubble(bubble, W / 2 + bubble.side * 60, H - 95, true, '#00c8e0');
    if (reply) drawBubble(reply, reply.side > 0 ? W - 85 : 85, H * 0.5, false, '#ff2a3d');
  }

  // ---------- Share card ----------
  const SITE_URL = 'https://piousnomea.github.io';

  function makeShareCard() {
    const CW = 1080, CH = 1350, k = CW / W, top = (CH - H * k) / 2;
    const c = document.createElement('canvas');
    c.width = CW; c.height = CH;
    const g = c.getContext('2d');
    g.fillStyle = '#07041a';
    g.fillRect(0, 0, CW, CH);
    if (crash.snapshot) g.drawImage(crash.snapshot, 0, top, CW, H * k);
    const grad = g.createLinearGradient(0, 0, 0, CH);
    grad.addColorStop(0, 'rgba(30,0,12,0.6)');
    grad.addColorStop(1, 'rgba(10,0,8,0.93)');
    g.fillStyle = grad;
    g.fillRect(0, 0, CW, CH);
    g.save(); g.translate(0, top); g.scale(k, k); drawCracks(crash.cracks, 0.35, g); g.restore();
    g.strokeStyle = '#ff2a3d'; g.lineWidth = 10;
    g.strokeRect(22, 22, CW - 44, CH - 44);

    glowText('撞到了！', CW / 2, 200, `900 150px ${CJK}`, '#ff2a3d', 40, g);
    const end = wrapText(`"${msg}"`, CW / 2, 410, CW - 170, 76, 'italic bold 60px Georgia, serif', '#ffffff', g);
    const y = Math.max(end + 150, 720);
    glowText('I WALKED', CW / 2, y, `32px ${PIXEL}`, '#c9c3d6', 0, g);
    glowText(`${finalScore} m`, CW / 2, y + 95, `92px ${PIXEL}`, '#00ffff', 30, g);
    glowText("through Hong Kong's phone zombies", CW / 2, y + 185, 'bold 40px Arial, sans-serif', '#ffffff', 0, g);
    if (newBest) glowText('NEW PERSONAL BEST!', CW / 2, y + 255, `28px ${PIXEL}`, '#ffe600', 16, g);
    glowText('低頭族 DASH', CW / 2, CH - 190, `900 66px ${CJK}`, '#ff2a3d', 22, g);
    glowText('Beat me at piousnomea.github.io', CW / 2, CH - 100, `24px ${PIXEL}`, '#ffe600', 10, g);
    return c;
  }

  function shareText() {
    return `"${msg}" 😂\nI made it ${finalScore} m dodging Hong Kong's phone zombies in 低頭族 DASH. Beat me: ${SITE_URL}`;
  }

  // The card is built as soon as the game ends, so tapping Share opens the
  // share sheet straight away (Safari blocks it if we make the image first).
  function prepareShare() {
    share = null;
    try {
      makeShareCard().toBlob((blob) => {
        if (!blob) return;
        let file = null;
        try { file = new File([blob], `dodge-dash-${finalScore}m.png`, { type: 'image/png' }); } catch (e) { file = null; }
        share = { blob, file };
      }, 'image/png');
    } catch (e) { share = null; }
  }

  function toast(text) {
    const el = document.getElementById('pzToast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function doShare() {
    if (state !== 'over') return;
    track('share-click');
    const text = shareText();
    if (share && share.file && navigator.canShare && navigator.canShare({ files: [share.file] })) {
      navigator.share({ files: [share.file], text })
        .then(() => track('share-done'))
        .catch((e) => { if (e && e.name !== 'AbortError') fallbackShare(text); });
      return;
    }
    if (!share && navigator.share) {   // card not ready: share the words at least
      navigator.share({ text }).then(() => track('share-done')).catch(() => {});
      return;
    }
    fallbackShare(text);
  }

  function fallbackShare(text) {
    track('share-fallback');
    if (share && share.blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(share.blob);
      a.download = share.file ? share.file.name : 'dodge-dash.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    const done = () => toast('Image saved and message copied. Paste it to a friend who\'ll laugh!');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => toast('Image saved. Send it to a friend who\'ll laugh!'));
    } else {
      toast('Image saved. Send it to a friend who\'ll laugh!');
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

  function drawBanners() {
    if (typhoonT > 0) {
      const shake = Math.sin(time * 40) * 1.5;
      glowText('八號風球！', W / 2 + shake, 62, `900 30px ${CJK}`, '#ffd400', 14);
      glowText('TYPHOON · 2× DISTANCE', W / 2, 92, `9px ${PIXEL}`, '#ffffff', 6);
      const bw = W - 140, frac = typhoonT / TYPHOON_TIME;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect((W - bw) / 2, 104, bw, 5);
      ctx.fillStyle = '#ffd400';
      ctx.fillRect((W - bw) / 2, 104, bw * frac, 5);
    }
    if (bannerT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, bannerT / 0.4);
      const pop = 1 + Math.max(0, bannerT - 1.3) * 1.5;
      ctx.translate(W / 2, 168); ctx.scale(pop, pop);
      ctx.fillStyle = 'rgba(5,0,15,0.6)';
      ctx.fillRect(-W / 2, -22, W, 70);
      glowText(bannerText, 0, 0, `20px ${PIXEL}`, '#00ffff', 12);
      glowText('SPEED UP!', 0, 30, `14px ${PIXEL}`, '#ffe600', 10);
      ctx.restore();
    }
  }

  function drawReady() {
    ctx.fillStyle = 'rgba(5,0,15,0.5)';
    ctx.fillRect(0, 0, W, H);
    glowText('低頭族', W / 2, 140, `900 56px ${CJK}`, '#ff2a3d', 22);
    glowText('DASH', W / 2, 200, `26px ${PIXEL}`, '#00ffff', 14);
    wrapText("Dodge Hong Kong's phone zombies", W / 2, 245, W - 40, 20, 'bold 16px Arial, sans-serif', '#ffffff');
    wrapText('← → or A / D to sidestep', W / 2, 300, W - 40, 20, '14px Arial, sans-serif', '#c9c3d6');
    wrapText('On a phone? Tap the left or right side', W / 2, 322, W - 40, 20, '14px Arial, sans-serif', '#c9c3d6');
    wrapText('Grab a typhoon signal for 2× distance… if you dare', W / 2, 352, W - 50, 18, 'bold 13px Arial, sans-serif', '#ffd400');
    if (best > 0) glowText(`BEST ${best} m`, W / 2, 395, `12px ${PIXEL}`, '#ffe600', 6);
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
    if (overT > RESTART_DELAY) glowText('SPACE = AGAIN  ·  S = SHARE', W / 2, H - 14, `7px ${PIXEL}`, '#8f86a6', 0);
    ctx.restore();
  }

  function renderWorld() {
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
    peds.concat(pickups).sort((a, b) => b.z - a.z)
      .forEach((o) => (o.isPickup ? drawPickup(o) : drawPed(o)));
    ctx.restore();
    drawStorm();
  }

  function render() {
    renderWorld();
    if (state === 'crash') {
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.85 - crashT * 3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(160,0,20,${Math.min(0.35, crashT * 0.6)})`;
      ctx.fillRect(0, 0, W, H);
      if (crashT > 0.05) drawCracks(crash.cracks, 0.9);
      drawFlyingPhone(crash.phone);
    }

    if (state === 'playing' || state === 'crash' || state === 'paused') drawHUD();
    if (state === 'playing') { drawBubbles(); drawBanners(); }
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
    if (state === 'playing') { state = 'paused'; canvas.style.touchAction = ''; audio.stopMusic(); audio.hush(); render(); }
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
    audio.init();   // browsers only allow sound after a tap or key press
    if (state === 'playing') {
      const next = clamp(targetLane + (dir || 0), 0, LANES - 1);
      if (next !== targetLane) {
        targetLane = next;
        audio.sfx.lane();
        try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* not supported */ }
      }
      return;
    }
    if (state === 'paused') { state = 'playing'; canvas.style.touchAction = 'none'; audio.startMusic(false); kick(); return; }
    if (state === 'crash') return;
    if (state === 'over' && overT < RESTART_DELAY) return;   // stops frantic taps restarting instantly
    start();
    kick();
  }

  // ---------- Buttons under / over the game ----------
  const actionsEl = document.getElementById('pzActions');
  const soundBtn = document.getElementById('pzSound');

  function showActions(show) {
    if (actionsEl) actionsEl.hidden = !show;
  }

  function refreshSoundBtn() {
    if (!soundBtn) return;
    const m = audio.isMuted();
    soundBtn.textContent = m ? '🔇 Sound off' : '🔊 Sound on';
    soundBtn.setAttribute('aria-pressed', String(m));
  }

  function toggleSound() {
    audio.init();
    audio.setMuted(!audio.isMuted());
    refreshSoundBtn();
    track(audio.isMuted() ? 'mute' : 'unmute');
  }

  const shareBtn = document.getElementById('pzShare');
  const againBtn = document.getElementById('pzAgain');
  if (shareBtn) shareBtn.addEventListener('click', doShare);
  if (againBtn) againBtn.addEventListener('click', () => { press(0); try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ } });
  if (soundBtn) soundBtn.addEventListener('click', toggleSound);
  refreshSoundBtn();

  window.addEventListener('keydown', (e) => {
    const typing = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (!typing && (e.key === 'm' || e.key === 'M') && (state === 'playing' || document.activeElement === canvas)) {
      toggleSound();
      return;
    }
    if ((e.key === 's' || e.key === 'S') && state === 'over' && document.activeElement === canvas) {
      doShare();
      return;
    }
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

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());   // no long-press menu on phones

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
