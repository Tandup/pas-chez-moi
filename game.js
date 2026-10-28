'use strict';
(() => {

// ---------- Carte ----------
const T = 32, COLS = 20, ROWS = 15, W = COLS * T, H = ROWS * T;
const PREP_TIME = 30, STEAL_TIME = 5, BALL_IMMUNITY = 5, GIFT_EVERY = 12;

// . jardin, T arbre, # mur, W fenêtre, D porte
// l salon, k cuisine, h couloir, b chambre
const MAP = [
  '....................',
  '.T..............T...',
  '...##W####W######...',
  '...#lllll#kkkkkk#...',
  '...#lllll#kkkkkkW...',
  '...Wllllllkkkkkk#...',
  '...#lllll#kkkkkk#...',
  '...###hh#####hh##...',
  '...#hhhhhhhh#bbb#...',
  '...#hhhhhhhhhbbb#...',
  '...#hhhhhhhh#bbb#...',
  '...#hhhhhhhh#bbb#...',
  '...######DD######...',
  '....................',
  '.T................T.',
];
const FLOORS = 'lkhb';

const FURNITURE = [
  { x: 6, y: 3, w: 2, h: 1, type: 'sofa' },
  { x: 12, y: 3, w: 4, h: 1, type: 'counter' },
  { x: 12, y: 4, w: 2, h: 2, type: 'table' },
  { x: 14, y: 10, w: 2, h: 2, type: 'bed' },
];
const VALUABLES = [
  { x: 8, y: 6, type: 'tv', name: 'la télé' },
  { x: 15, y: 8, type: 'pc', name: "l'ordinateur" },
  { x: 4, y: 11, type: 'console', name: 'la console' },
];
const ENTRIES = [
  { x: 5, y: 2 }, { x: 10, y: 2 }, { x: 3, y: 5 }, { x: 16, y: 4 }, { x: 9, y: 12, door: true },
];
// Hors des zones couvertes par l'interface (barre du haut, pièges, boutons)
const SPAWNS = [[1, 8], [18, 8], [1, 3], [18, 11]];

const TRAPS = {
  banane: { icon: '🍌', count: 2, stun: 2.5, say: 'Waaah !' },
  billes: { icon: '🔵', count: 2, stun: 2, say: 'Oups !' },
  voiture: { icon: '🚗', count: 2, stun: 2, say: 'Aïe, mon pied !' },
  miel: { icon: '🍯', count: 2, slow: 6, say: 'Ça colle !' },
  seau: { icon: '🪣', count: 1, stun: 3.5, say: 'Splash !' },
};

const key = (c, r) => c + ',' + r;
const tileAt = (c, r) => (c < 0 || r < 0 || c >= COLS || r >= ROWS) ? 'X' : MAP[r][c];
const blocked = new Set();
FURNITURE.forEach(f => { for (let i = 0; i < f.w; i++) for (let j = 0; j < f.h; j++) blocked.add(key(f.x + i, f.y + j)); });
VALUABLES.forEach(v => blocked.add(key(v.x, v.y)));
const isFloor = (c, r) => FLOORS.includes(tileAt(c, r)) && !blocked.has(key(c, r));
const isWallish = (c, r) => '#WD'.includes(tileAt(c, r));
const center = n => n * T + T / 2;
const cell = p => Math.floor(p / T);

function bfs(sc, sr, pass, goal) {
  const prev = new Map([[key(sc, sr), null]]);
  const q = [[sc, sr]];
  while (q.length) {
    const [c, r] = q.shift();
    if (goal(c, r)) {
      const path = [];
      for (let cur = [c, r]; cur; cur = prev.get(key(cur[0], cur[1]))) path.unshift(cur);
      return path;
    }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, k = key(nc, nr);
      if (!prev.has(k) && pass(nc, nr)) { prev.set(k, [c, r]); q.push([nc, nr]); }
    }
  }
  return null;
}

// ---------- Son ----------
let AC = null;
function sfx(f1, f2, d, type = 'square', v = 0.07) {
  if (!AC) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(AC.destination);
  o.start(t); o.stop(t + d);
}
const SND = {
  place: () => sfx(500, 800, 0.08),
  trap: () => { sfx(700, 120, 0.4, 'sawtooth'); },
  throw: () => sfx(300, 600, 0.12, 'triangle', 0.1),
  hit: () => sfx(200, 80, 0.2, 'square', 0.1),
  crack: () => sfx(1200, 200, 0.25, 'sawtooth', 0.05),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => sfx(f, f, 0.18, 'triangle', 0.12), i * 140)),
  lose: () => [392, 330, 262].forEach((f, i) => setTimeout(() => sfx(f, f * 0.95, 0.3, 'triangle', 0.12), i * 220)),
};

// ---------- Écran ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let scale = 1;
function resize() {
  const vw = innerWidth, vh = innerHeight, s = Math.min(vw / W, vh / H);
  const cw = W * s, ch = H * s, dpr = Math.min(devicePixelRatio || 1, 2);
  Object.assign(canvas.style, { width: cw + 'px', height: ch + 'px', left: (vw - cw) / 2 + 'px', top: (vh - ch) / 2 + 'px' });
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  scale = canvas.width / W;
}
addEventListener('resize', resize);
resize();

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function circle(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
function ellipse(c, x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }

// ---------- Décor fixe ----------
const bg = document.createElement('canvas');
bg.width = W * 2; bg.height = H * 2;
(function drawBackground() {
  const c = bg.getContext('2d');
  c.scale(2, 2);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  c.fillStyle = '#7cc35a';
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W, y = rnd() * H;
    c.strokeStyle = '#69b04a'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x - 1, y - 4); c.moveTo(x + 1, y); c.lineTo(x + 3, y - 4); c.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = rnd() * H;
    if (cell(x) >= 3 && cell(x) <= 16 && cell(y) >= 2 && cell(y) <= 12) continue;
    circle(c, x, y, 2.5, ['#fff', '#fac775', '#ed93b1'][i % 3]);
  }
  c.fillStyle = '#e0c28c';
  c.fillRect(9 * T + 4, 13 * T, 2 * T - 8, 2 * T);
  rr(c, 9 * T + 6, 13 * T + 4, 2 * T - 12, 14, 4); c.fillStyle = '#c0504d'; c.fill();

  for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
    const t = MAP[r][col], x = col * T, y = r * T;
    if (t === 'l' || t === 'h') {
      c.fillStyle = t === 'l' ? '#e9c995' : '#d7a96f';
      c.fillRect(x, y, T, T);
      c.fillStyle = t === 'l' ? '#d9b47c' : '#c4955c';
      for (let k = 0; k < 4; k++) c.fillRect(x, y + k * 8 + 7, T, 1);
      c.fillRect(x + ((r % 2) ? 10 : 22), y, 1, T);
    } else if (t === 'k') {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        c.fillStyle = (i + j + col + r) % 2 ? '#d8dbe0' : '#f4efe4';
        c.fillRect(x + i * 16, y + j * 16, 16, 16);
      }
    } else if (t === 'b') {
      c.fillStyle = '#c9b6e4'; c.fillRect(x, y, T, T);
      c.fillStyle = '#b8a2d8';
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c.fillRect(x + 5 + i * 10, y + 5 + j * 10, 2, 2);
    }
  }
  // Murs vus en trois quarts : dessus clair, face avant foncée
  for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
    const t = MAP[r][col], x = col * T, y = r * T;
    if (!'#WD'.includes(t)) continue;
    c.fillStyle = '#a8714a'; c.fillRect(x, y, T, T);
    if (!isWallish(col, r + 1)) { c.fillStyle = '#7a4a2c'; c.fillRect(x, y + T - 10, T, 10); }
    if (t === 'W') {
      const horiz = isWallish(col - 1, r) && isWallish(col + 1, r);
      c.fillStyle = '#5a3a1e';
      if (horiz) { c.fillRect(x + 2, y + 6, T - 4, 14); c.fillStyle = '#a9dcf5'; c.fillRect(x + 4, y + 8, T - 8, 10); }
      else { c.fillRect(x + 8, y + 2, 16, T - 4); c.fillStyle = '#a9dcf5'; c.fillRect(x + 10, y + 4, 12, T - 8); }
      c.fillStyle = 'rgba(255,255,255,.7)';
      c.fillRect(horiz ? x + 7 : x + 12, horiz ? y + 10 : y + 7, 3, 3);
    }
  }
  const dx = 9 * T, dy = 12 * T;
  c.fillStyle = '#b5651d'; c.fillRect(dx + 3, dy + 2, 2 * T - 6, T - 2);
  c.fillStyle = '#9a5418';
  for (let k = 1; k < 4; k++) c.fillRect(dx + 3 + k * 14.5, dy + 2, 1.5, T - 2);
  circle(c, dx + 2 * T - 12, dy + 18, 2.5, '#f2d26b');

  // Arbres
  for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
    if (MAP[r][col] !== 'T') continue;
    const x = center(col), y = center(r);
    ellipse(c, x + 3, y + 14, 20, 7, 'rgba(0,0,0,.18)');
    c.fillStyle = '#7a4a2c'; c.fillRect(x - 4, y, 8, 14);
    circle(c, x, y - 6, 20, '#3f8f3a');
    circle(c, x - 7, y - 11, 10, '#55a84a');
    circle(c, x + 8, y - 2, 8, '#55a84a');
  }

  // Meubles
  for (const f of FURNITURE) {
    const x = f.x * T, y = f.y * T, w = f.w * T, h = f.h * T;
    if (f.type === 'sofa') {
      rr(c, x + 2, y + 4, w - 4, h - 6, 8); c.fillStyle = '#a8403d'; c.fill();
      rr(c, x + 6, y + 12, w - 12, h - 16, 5); c.fillStyle = '#c0504d'; c.fill();
      c.fillStyle = '#a8403d'; c.fillRect(x + w / 2 - 1, y + 12, 2, h - 16);
    } else if (f.type === 'counter') {
      c.fillStyle = '#9aa3ad'; c.fillRect(x, y, w, h - 4);
      c.fillStyle = '#c3c9cf'; c.fillRect(x, y, w, 8);
      rr(c, x + T + 6, y + 10, 20, 12, 3); c.fillStyle = '#7d8790'; c.fill();
      circle(c, x + 3 * T + 10, y + 16, 5, '#444441');
      circle(c, x + 3 * T + 22, y + 16, 5, '#444441');
    } else if (f.type === 'table') {
      ellipse(c, x + w / 2, y + h / 2 + 4, 28, 12, 'rgba(0,0,0,.12)');
      circle(c, x + w / 2, y + h / 2, 26, '#8a5a2b');
      circle(c, x + w / 2, y + h / 2, 22, '#a0703f');
      circle(c, x + w / 2 - 8, y + h / 2 - 4, 6, '#fff');
      circle(c, x + w / 2 + 9, y + h / 2 + 5, 6, '#fff');
    } else if (f.type === 'bed') {
      rr(c, x + 2, y + 2, w - 4, h - 4, 6); c.fillStyle = '#7a4a2c'; c.fill();
      rr(c, x + 6, y + 6, w - 12, h - 12, 5); c.fillStyle = '#f4f0e0'; c.fill();
      rr(c, x + 6, y + 24, w - 12, h - 30, 5); c.fillStyle = '#5f9fd8'; c.fill();
      rr(c, x + 14, y + 9, w - 28, 12, 5); c.fillStyle = '#fff'; c.fill();
    }
  }
})();

// ---------- État du jeu ----------
let G = null;
const inv0 = () => Object.fromEntries(Object.entries(TRAPS).map(([k, t]) => [k, t.count]));

function newGame(duration) {
  const [sc, sr] = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
  G = {
    phase: 'prep', prepLeft: PREP_TIME, timeLeft: duration, duration, t: 0,
    traps: new Map(), inv: inv0(), sel: 'banane', ammo: 3, items: [], giftT: 8,
    kid: { x: center(9), y: center(9), dir: { x: 0, y: 1 }, walk: 0, cd: 0 },
    bur: { x: center(sc), y: center(sr), state: 'wait', path: [], entry: null, target: null,
      stun: 0, slow: 0, immune: 0, rage: 0, steal: 0, enterT: 0, resume: null, bob: 0, face: 1 },
    balls: [], fx: [], hits: 0, broken: new Set(), result: null,
  };
  buildTrapBar();
  showHud();
}

function fx(x, y, text, color = '#fff', size = 16) { G.fx.push({ x, y, text, color, size, t: 0 }); }

// ---------- Cambrioleur ----------
function burglarSpeed(b) { return 62 * (1 + Math.min(b.rage, 8) * 0.1) * (b.slow > 0 ? 0.4 : 1); }

function repath(b) {
  const c = cell(b.x), r = cell(b.y), e = b.entry;
  if (b.state === 'approach') {
    b.path = bfs(c, r, (x, y) => tileAt(x, y) === '.' || (x === e.x && y === e.y), (x, y) => x === e.x && y === e.y) || [];
  } else {
    const v = b.target;
    b.path = bfs(c, r, (x, y) => isFloor(x, y) || (x === e.x && y === e.y),
      (x, y) => isFloor(x, y) && Math.abs(x - v.x) + Math.abs(y - v.y) === 1) || [];
  }
}

// Une balle ne fait que l'arrêter : le vol reprend là où il en était.
// Seul un piège sous ses pieds lui fait lâcher l'objet.
function stunBurglar(b, sec, say, color) {
  if (b.state !== 'stunned') b.resume = b.state === 'stealing' ? 'inside' : b.state;
  b.state = 'stunned';
  b.stun = Math.max(b.stun, sec);
  fx(b.x, b.y - 34, say, color);
}

function checkTrap(b) {
  const c = cell(b.x), r = cell(b.y), k = key(c, r);
  if (!G.traps.has(k) || Math.hypot(b.x - center(c), b.y - center(r)) > 12) return false;
  const def = TRAPS[G.traps.get(k)];
  G.traps.delete(k);
  b.rage += 1;
  G.hits += 1;
  SND.trap();
  if (b.steal > 0 || b.state === 'stealing') {
    b.steal = 0;
    const others = VALUABLES.filter(v => v !== b.target);
    b.target = others[Math.floor(Math.random() * others.length)];
    fx(b.x, b.y - 54, 'Bon… ' + b.target.name + ' alors !', '#ffd0c0', 13);
    if (b.state === 'stealing') b.state = 'inside';
  }
  if (def.slow) { b.slow = def.slow; fx(b.x, b.y - 34, def.say, '#fac775'); repath(b); }
  else stunBurglar(b, def.stun, def.say, '#fff27a');
  return true;
}

function updateBurglar(b, dt) {
  b.bob += dt * (b.state === 'stunned' ? 0 : 10);
  if (b.slow > 0) b.slow -= dt;
  if (b.immune > 0) b.immune -= dt;
  if (b.state === 'wait') return;
  if (b.state === 'stunned') {
    b.stun -= dt;
    if (b.stun <= 0) { b.state = b.resume; repath(b); }
    return;
  }
  if (b.state === 'entering') {
    b.enterT -= dt;
    if (b.enterT <= 0) {
      G.broken.add(key(b.entry.x, b.entry.y));
      b.state = 'inside';
      b.target = VALUABLES[Math.floor(Math.random() * VALUABLES.length)];
      fx(b.x, b.y - 34, 'Je veux ' + b.target.name + ' !', '#ffd0c0');
      repath(b);
    }
    return;
  }
  if ((b.state === 'inside' || b.state === 'stealing') && checkTrap(b)) return;
  if (b.state === 'stealing') {
    b.steal += dt * (b.slow > 0 ? 0.4 : 1);
    if (b.steal >= STEAL_TIME) endGame(false);
    return;
  }
  // Marche le long du chemin
  if (!b.path.length) {
    if (b.state === 'approach') {
      b.state = 'entering';
      b.enterT = b.entry.door ? 3 : 2;
      fx(b.x, b.y - 34, b.entry.door ? 'Crochetage…' : 'Crac !', '#ffd0c0');
      SND.crack();
    } else {
      const v = b.target;
      if (Math.abs(cell(b.x) - v.x) + Math.abs(cell(b.y) - v.y) === 1) { b.state = 'stealing'; b.steal = Math.max(0, b.steal); }
      else repath(b);
    }
    return;
  }
  const [tc, tr] = b.path[0], tx = center(tc), ty = center(tr);
  const dx = tx - b.x, dy = ty - b.y, dist = Math.hypot(dx, dy), step = burglarSpeed(b) * dt;
  if (Math.abs(dx) > 1) b.face = Math.sign(dx);
  if (dist <= step) {
    b.x = tx; b.y = ty; b.path.shift();
  } else {
    b.x += dx / dist * step; b.y += dy / dist * step;
  }
}

// ---------- Enfant ----------
const input = { x: 0, y: 0 };
const keys = new Set();

function canStand(x, y) {
  const r = 9;
  return isFloor(cell(x - r), cell(y - r)) && isFloor(cell(x + r), cell(y - r)) &&
         isFloor(cell(x - r), cell(y + r)) && isFloor(cell(x + r), cell(y + r));
}

function updateKid(k, dt) {
  k.cd = Math.max(0, k.cd - dt);
  let ix = input.x, iy = input.y;
  if (keys.size) {
    ix = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    iy = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
  }
  const mag = Math.hypot(ix, iy);
  if (mag < 0.15) return;
  k.dir = { x: ix / mag, y: iy / mag };
  k.walk += dt * 14;
  const sp = 125 * dt;
  const nx = k.x + ix * sp, ny = k.y + iy * sp;
  // Glisse le long des murs et aide à passer les portes
  if (canStand(nx, k.y)) k.x = nx;
  else if (Math.abs(ix) > 0.3) { const cy = center(cell(k.y)); k.y += Math.sign(cy - k.y) * Math.min(Math.abs(cy - k.y), sp); }
  if (canStand(k.x, ny)) k.y = ny;
  else if (Math.abs(iy) > 0.3) { const cx = center(cell(k.x)); k.x += Math.sign(cx - k.x) * Math.min(Math.abs(cx - k.x), sp); }
}

function throwBall() {
  if (!G || G.phase !== 'defense') return;
  const k = G.kid;
  if (k.cd > 0) return;
  if (G.ammo <= 0) { hint('Plus de balles ! Ramasse-les par terre.', 2); return; }
  k.cd = 0.5;
  G.ammo--;
  G.balls.push({ x: k.x + k.dir.x * 12, y: k.y - 6 + k.dir.y * 12, vx: k.dir.x * 330, vy: k.dir.y * 330,
    life: 1.4, lc: cell(k.x), lr: cell(k.y) });
  SND.throw();
}

function spawnGift() {
  for (let n = 0; n < 60; n++) {
    const c = 4 + Math.floor(Math.random() * 12), r = 3 + Math.floor(Math.random() * 9);
    if (!isFloor(c, r) || G.traps.has(key(c, r)) || G.items.some(i => i.c === c && i.r === r)) continue;
    if (c === cell(G.kid.x) && r === cell(G.kid.y)) continue;
    G.items.push({ c, r, type: 'gift' });
    fx(center(c), center(r) - 20, 'Cadeau !', '#fac775', 13);
    return;
  }
}

// L'enfant ramasse ses balles et les cadeaux (un piège au hasard) en marchant dessus
function pickUp() {
  const kc = cell(G.kid.x), kr = cell(G.kid.y);
  G.items = G.items.filter(it => {
    if (it.c !== kc || it.r !== kr) return true;
    if (it.type === 'ball') G.ammo++;
    else {
      const types = Object.keys(TRAPS), t = types[Math.floor(Math.random() * types.length)];
      G.inv[t]++;
      buildTrapBar();
      fx(G.kid.x, G.kid.y - 34, '+' + TRAPS[t].icon, '#fff', 20);
    }
    SND.place();
    return false;
  });
}

function placeTrapAt(c, r) {
  if (!isFloor(c, r)) return false;
  const k = key(c, r);
  if (G.traps.has(k)) {
    if (G.phase === 'prep') { G.inv[G.traps.get(k)]++; G.traps.delete(k); buildTrapBar(); }
    return false;
  }
  if (G.inv[G.sel] <= 0) { hint('Plus de ' + G.sel + ' ! Choisis un autre piège.'); return false; }
  G.inv[G.sel]--; G.traps.set(k, G.sel);
  SND.place();
  buildTrapBar();
  return true;
}

function placeAtKid() {
  if (!G || G.phase !== 'defense') return;
  placeTrapAt(cell(G.kid.x), cell(G.kid.y));
}

// ---------- Boucle ----------
function startDefense() {
  G.phase = 'defense';
  const b = G.bur;
  b.entry = ENTRIES[Math.floor(Math.random() * ENTRIES.length)];
  b.state = 'approach';
  repath(b);
  fx(b.x, b.y - 34, 'Hé hé hé…', '#ffd0c0');
  showHud();
}

function endGame(win) {
  if (G.result) return;
  G.result = win ? 'win' : 'lose';
  G.phase = 'over';
  (win ? SND.win : SND.lose)();
  setTimeout(() => showOverlay(win), 900);
}

let last = performance.now(), hintTimer = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G) update(dt);
  render();
  requestAnimationFrame(frame);
}

function update(dt) {
  G.t += dt;
  if (G.phase === 'prep') {
    G.prepLeft -= dt;
    if (G.prepLeft <= 0) startDefense();
  } else if (G.phase === 'defense') {
    G.timeLeft -= dt;
    updateKid(G.kid, dt);
    pickUp();
    updateBurglar(G.bur, dt);
    if ((G.giftT -= dt) <= 0) {
      G.giftT = GIFT_EVERY;
      if (G.items.filter(i => i.type === 'gift').length < 2) spawnGift();
    }
    if (G.timeLeft <= 0) { G.timeLeft = 0; endGame(true); }
  } else if (G.phase === 'over') {
    G.bur.bob += dt * 4;
  }
  for (const ball of G.balls) {
    ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.life -= dt;
    const c = cell(ball.x), r = cell(ball.y + 6);
    if (isFloor(c, r)) { ball.lc = c; ball.lr = r; }
    else { ball.life = 0; fx(ball.x, ball.y, 'pof', '#fff', 12); }
    const b = G.bur;
    if (ball.life > 0 && (b.state === 'inside' || b.state === 'stealing') && Math.hypot(ball.x - b.x, ball.y - (b.y - 8)) < 20) {
      ball.life = 0;
      if (b.immune > 0) fx(b.x, b.y - 34, 'Même pas mal !', '#fff');
      else {
        b.rage += 0.3; SND.hit();
        stunBurglar(b, 1, 'Bong !', '#fff');
        b.immune = BALL_IMMUNITY;
      }
    }
    if (ball.life <= 0) G.items.push({ c: ball.lc, r: ball.lr, type: 'ball' });
  }
  G.balls = G.balls.filter(b => b.life > 0);
  for (const f of G.fx) f.t += dt;
  G.fx = G.fx.filter(f => f.t < 1.4);
  if (hintTimer > 0 && (hintTimer -= dt) <= 0) hintEl.textContent = '';
  updateHud();
}

// ---------- Dessin ----------
function drawKid(k) {
  const x = k.x, y = k.y, moving = G.phase === 'defense' && Math.hypot(input.x, input.y) + keys.size > 0.15;
  const s = moving ? Math.sin(k.walk) * 2.5 : 0;
  ellipse(ctx, x, y + 12, 11, 4, 'rgba(0,0,0,.2)');
  ctx.fillStyle = '#2f4d7a';
  rr(ctx, x - 7, y + 2 + s, 6, 9, 2); ctx.fill();
  rr(ctx, x + 1, y + 2 - s, 6, 9, 2); ctx.fill();
  rr(ctx, x - 9, y - 8, 18, 14, 5); ctx.fillStyle = '#e8613c'; ctx.fill();
  ctx.fillStyle = '#f2c79a';
  circle(ctx, x - 10 + k.dir.x * 2, y - 2 + s / 2, 3.5, '#f2c79a');
  circle(ctx, x + 10 + k.dir.x * 2, y - 2 - s / 2, 3.5, '#f2c79a');
  circle(ctx, x, y - 15, 10, '#f2c79a');
  ctx.beginPath(); ctx.arc(x, y - 16, 10.5, Math.PI, 0); ctx.fillStyle = '#2f78c4'; ctx.fill();
  rr(ctx, x - 5 + k.dir.x * 8, y - 18 + (k.dir.y < -0.5 ? -4 : 0), 10, 4, 2); ctx.fill();
  if (k.dir.y > -0.5) {
    circle(ctx, x - 3.5 + k.dir.x * 3, y - 13, 1.6, '#2c2c2a');
    circle(ctx, x + 3.5 + k.dir.x * 3, y - 13, 1.6, '#2c2c2a');
    ctx.beginPath(); ctx.arc(x + k.dir.x * 3, y - 10, 2.5, 0.2, Math.PI - 0.2);
    ctx.strokeStyle = '#7a3a1e'; ctx.lineWidth = 1.2; ctx.stroke();
  }
}

function drawBurglar(b) {
  const moving = b.state === 'approach' || b.state === 'inside';
  const s = moving ? Math.sin(b.bob) * 2.5 : 0;
  const x = b.x, y = b.y - (b.state === 'entering' ? 4 : 0);
  ellipse(ctx, x, b.y + 14, 14, 5, 'rgba(0,0,0,.22)');
  if (b.immune > 0 && b.state !== 'stunned') {
    ctx.beginPath(); ctx.arc(x, y - 6, 26, 0, Math.PI * 2);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  }
  if (b.slow > 0) ellipse(ctx, x, b.y + 13, 16, 6, 'rgba(239,159,39,.75)');
  circle(ctx, x - 15 * b.face, y + 2, 10, '#c9ad7c');
  ctx.fillStyle = '#a88a5c'; ctx.fillRect(x - 15 * b.face - 3, y - 9, 6, 5);
  ctx.fillStyle = '#2c2c2a';
  rr(ctx, x - 9, y + 4 + s, 7, 11, 2); ctx.fill();
  rr(ctx, x + 2, y + 4 - s, 7, 11, 2); ctx.fill();
  rr(ctx, x - 12, y - 10, 24, 20, 7); ctx.fill();
  ctx.fillStyle = '#f1efe8';
  ctx.fillRect(x - 12, y - 4, 24, 3);
  ctx.fillRect(x - 12, y + 3, 24, 3);
  circle(ctx, x + 13 * b.face, y - 1, 4, '#e3b48a');
  const hx = x, hy = y - 20;
  circle(ctx, hx, hy, 11, b.rage > 4 ? '#eaa082' : '#e3b48a');
  ctx.beginPath(); ctx.arc(hx, hy - 2, 11.5, Math.PI, 0); ctx.fillStyle = '#444441'; ctx.fill();
  ctx.fillStyle = '#1d1d1f'; ctx.fillRect(hx - 11, hy - 1, 22, 6);
  if (b.state === 'stunned') {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    for (const o of [-4, 4]) {
      ctx.beginPath();
      ctx.moveTo(hx + o - 2 + b.face, hy); ctx.lineTo(hx + o + 2 + b.face, hy + 4);
      ctx.moveTo(hx + o + 2 + b.face, hy); ctx.lineTo(hx + o - 2 + b.face, hy + 4);
      ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const a = G.t * 5 + i * 2.1;
      drawStar(hx + Math.cos(a) * 15, hy - 12 + Math.sin(a) * 5, 4);
    }
  } else {
    circle(ctx, hx - 4 + b.face * 2, hy + 2, 2, '#fff');
    circle(ctx, hx + 4 + b.face * 2, hy + 2, 2, '#fff');
    circle(ctx, hx - 4 + b.face * 2.6, hy + 2, 1, '#1d1d1f');
    circle(ctx, hx + 4 + b.face * 2.6, hy + 2, 1, '#1d1d1f');
    ctx.beginPath(); ctx.moveTo(hx - 4, hy + 8); ctx.lineTo(hx + 4, hy + 8);
    ctx.strokeStyle = '#7a3a1e'; ctx.lineWidth = 1.4; ctx.stroke();
  }
  if (b.state === 'stealing') {
    rr(ctx, x - 20, y - 46, 40, 7, 3); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
    rr(ctx, x - 19, y - 45, 38 * Math.min(1, b.steal / STEAL_TIME), 5, 2); ctx.fillStyle = '#e24b4a'; ctx.fill();
  }
}

function drawStar(x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fillStyle = '#fff27a'; ctx.fill();
}

function drawValuable(v) {
  const x = v.x * T, y = v.y * T, b = G && G.bur;
  const targeted = b && b.target === v && b.state !== 'wait';
  const shake = b && b.state === 'stealing' && b.target === v ? Math.sin(G.t * 40) * 1.5 : 0;
  ctx.save(); ctx.translate(shake, 0);
  if (targeted) {
    rr(ctx, x + 1, y + 1, T - 2, T - 2, 6);
    ctx.strokeStyle = `rgba(226,75,74,${0.5 + 0.5 * Math.sin(G.t * 8)})`; ctx.lineWidth = 3; ctx.stroke();
  }
  if (v.type === 'tv') {
    ctx.fillStyle = '#6b4329'; ctx.fillRect(x + 3, y + 20, T - 6, 10);
    rr(ctx, x + 3, y + 3, T - 6, 19, 3); ctx.fillStyle = '#1d1d1f'; ctx.fill();
    ctx.fillStyle = `hsl(${(G ? G.t * 60 : 0) % 360},55%,62%)`; ctx.fillRect(x + 6, y + 6, T - 12, 13);
  } else if (v.type === 'pc') {
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x + 1, y + 16, T - 2, 14);
    rr(ctx, x + 6, y + 2, 20, 15, 2); ctx.fillStyle = '#5f5e5a'; ctx.fill();
    ctx.fillStyle = '#85b7eb'; ctx.fillRect(x + 8, y + 4, 16, 10);
    ctx.fillStyle = '#d3d1c7'; ctx.fillRect(x + 7, y + 20, 18, 5);
  } else {
    ctx.fillStyle = '#6b4329'; ctx.fillRect(x + 2, y + 14, T - 4, 16);
    rr(ctx, x + 5, y + 6, 22, 10, 3); ctx.fillStyle = '#f1efe8'; ctx.fill();
    rr(ctx, x + 7, y + 18, 18, 9, 4); ctx.fillStyle = '#534ab7'; ctx.fill();
    circle(ctx, x + 11, y + 22, 1.6, '#fff'); circle(ctx, x + 21, y + 21, 1.6, '#f09595'); circle(ctx, x + 23, y + 24, 1.6, '#97c459');
  }
  ctx.restore();
  if (!targeted) drawStar(x + T - 4, y + 2 + Math.sin((G ? G.t : 0) * 3 + v.x) * 2, 4);
}

function render() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.drawImage(bg, 0, 0, W, H);
  if (!G) { VALUABLES.forEach(drawValuable); return; }

  for (const k of G.broken) {
    const [c, r] = k.split(',').map(Number), x = c * T, y = r * T;
    if (tileAt(c, r) !== 'W') { ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x + 3, y + 2, 2 * T - 6, T - 2); continue; }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x + 10, y + 8); ctx.lineTo(x + 16, y + 16); ctx.lineTo(x + 22, y + 9);
    ctx.moveTo(x + 16, y + 16); ctx.lineTo(x + 14, y + 24); ctx.stroke();
  }

  if (G.phase === 'prep') {
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
      if (isFloor(c, r)) ctx.strokeRect(c * T + 2.5, r * T + 2.5, T - 5, T - 5);
    ctx.setLineDash([]);
  }

  ctx.font = '22px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [k, type] of G.traps) {
    const [c, r] = k.split(',').map(Number);
    ellipse(ctx, center(c), center(r) + 9, 10, 3, 'rgba(0,0,0,.15)');
    ctx.fillStyle = '#000';
    ctx.fillText(TRAPS[type].icon, center(c), center(r) + 1);
  }

  for (const it of G.items) {
    const x = center(it.c), y = center(it.r);
    if (it.type === 'ball') {
      ellipse(ctx, x, y + 9, 5, 2, 'rgba(0,0,0,.2)');
      circle(ctx, x, y + 4, 5, '#e24b4a');
      circle(ctx, x - 1.5, y + 2.5, 1.6, '#fff');
    } else {
      const bob = Math.sin(G.t * 4 + it.c) * 2;
      ellipse(ctx, x, y + 10, 10, 3, 'rgba(0,0,0,.2)');
      rr(ctx, x - 9, y - 6 + bob, 18, 15, 3); ctx.fillStyle = '#e8613c'; ctx.fill();
      ctx.fillStyle = '#fac775';
      ctx.fillRect(x - 2, y - 6 + bob, 4, 15);
      ctx.fillRect(x - 9, y - 1 + bob, 18, 4);
      circle(ctx, x - 4, y - 8 + bob, 3.5, '#fac775');
      circle(ctx, x + 4, y - 8 + bob, 3.5, '#fac775');
    }
  }

  VALUABLES.forEach(drawValuable);

  const b = G.bur;
  if (b.state === 'entering') {
    const a = 0.5 + 0.5 * Math.sin(G.t * 10);
    ctx.fillStyle = `rgba(226,75,74,${a})`;
    ctx.font = 'bold 26px ui-rounded, system-ui, sans-serif';
    ctx.fillText('!', center(b.entry.x), center(b.entry.y) - 40);
  }

  const actors = [{ y: G.kid.y, d: () => drawKid(G.kid) }, { y: b.y, d: () => drawBurglar(b) }];
  actors.sort((a1, a2) => a1.y - a2.y).forEach(a => a.d());

  for (const ball of G.balls) {
    ellipse(ctx, ball.x, ball.y + 12, 4, 2, 'rgba(0,0,0,.2)');
    circle(ctx, ball.x, ball.y, 5, '#e24b4a');
    circle(ctx, ball.x - 1.5, ball.y - 1.5, 1.6, '#fff');
  }

  ctx.lineJoin = 'round';
  for (const f of G.fx) {
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
    ctx.font = `bold ${f.size}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
    const y = f.y - f.t * 22;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,20,10,.85)'; ctx.strokeText(f.text, f.x, y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, y);
  }
  ctx.globalAlpha = 1;
}

// ---------- Interface ----------
const $ = id => document.getElementById(id);
const hud = $('hud'), overlay = $('overlay'), hintEl = $('hint'), trapbar = $('trapbar');
const timerEl = $('timer'), phaseEl = $('phase'), rageEl = $('rage'), goBtn = $('go');
const joyzone = $('joyzone'), joy = $('joy'), knob = $('knob'), actions = $('actions'), btnThrow = $('btnThrow');

function hint(text, sec = 3) { hintEl.textContent = text; hintTimer = sec; }

function buildTrapBar() {
  trapbar.innerHTML = '';
  for (const [k, t] of Object.entries(TRAPS)) {
    const b = document.createElement('button');
    b.className = 'trap' + (G.sel === k ? ' sel' : '') + (G.inv[k] ? '' : ' empty');
    b.innerHTML = `<span>${t.icon}</span><span class="n">${G.inv[k]}</span>`;
    b.addEventListener('pointerdown', e => { e.preventDefault(); G.sel = k; buildTrapBar(); });
    trapbar.appendChild(b);
  }
}

function showHud() {
  hud.classList.remove('hidden');
  overlay.classList.add('hidden');
  const prep = G.phase === 'prep';
  goBtn.classList.toggle('hidden', !prep);
  joyzone.classList.toggle('hidden', prep);
  actions.classList.toggle('hidden', prep);
  if (prep) hint('Choisis un piège en bas, puis touche le sol pour le poser.', 6);
  else hint('Les balles l\'arrêtent un instant. Pour qu\'il lâche un objet, pose un piège sous ses pieds !', 6);
}

const fmt = s => { s = Math.ceil(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
let lastTimer = '';
function updateHud() {
  const txt = G.phase === 'prep' ? fmt(G.prepLeft) : fmt(G.timeLeft);
  if (txt !== lastTimer) { timerEl.textContent = txt; lastTimer = txt; }
  phaseEl.textContent = G.phase === 'prep' ? 'Préparation' : 'Parents bientôt là';
  rageEl.style.width = Math.min(100, G.bur.rage / 8 * 100) + '%';
  btnThrow.classList.toggle('cool', G.kid.cd > 0 || G.ammo <= 0);
  const throwTxt = 'Lancer ' + G.ammo;
  if (btnThrow.textContent !== throwTxt) btnThrow.textContent = throwTxt;
}

function showOverlay(win) {
  hud.classList.add('hidden');
  overlay.classList.remove('hidden');
  $('ovTitle').textContent = win ? 'Bravo !' : 'Oh non !';
  $('ovText').textContent = win
    ? `Les parents sont rentrés et la maison est sauvée. Le cambrioleur est tombé dans ${G.hits} piège${G.hits > 1 ? 's' : ''}.`
    : `Le cambrioleur a volé ${G.bur.target.name}. Essaie de mettre des pièges près des fenêtres !`;
}

document.querySelectorAll('#ovButtons button').forEach(btn => btn.addEventListener('click', () => {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  newGame(Number(btn.dataset.dur));
}));
goBtn.addEventListener('pointerdown', e => { e.preventDefault(); if (G && G.phase === 'prep') startDefense(); });
btnThrow.addEventListener('pointerdown', e => { e.preventDefault(); throwBall(); });
$('btnPlace').addEventListener('pointerdown', e => { e.preventDefault(); placeAtKid(); });

canvas.addEventListener('pointerdown', e => {
  if (!G || G.phase !== 'prep') return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * W, y = (e.clientY - rect.top) / rect.height * H;
  placeTrapAt(cell(x), cell(y));
});

// Joystick : il apparaît là où le doigt se pose
let joyId = null, joyOx = 0, joyOy = 0;
const JOY_R = 50;
joyzone.addEventListener('pointerdown', e => {
  if (joyId !== null) return;
  joyId = e.pointerId; joyzone.setPointerCapture(e.pointerId);
  const r = joyzone.getBoundingClientRect();
  joyOx = e.clientX; joyOy = e.clientY;
  joy.style.left = (e.clientX - r.left) + 'px'; joy.style.top = (e.clientY - r.top) + 'px';
});
joyzone.addEventListener('pointermove', e => {
  if (e.pointerId !== joyId) return;
  let dx = e.clientX - joyOx, dy = e.clientY - joyOy;
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  input.x = dx / JOY_R; input.y = dy / JOY_R;
});
const joyEnd = e => {
  if (e.pointerId !== joyId) return;
  joyId = null; input.x = 0; input.y = 0;
  knob.style.transform = '';
};
joyzone.addEventListener('pointerup', joyEnd);
joyzone.addEventListener('pointercancel', joyEnd);

// Clavier (pour tester sur ordinateur)
const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', z: 'up', s: 'down', a: 'left', q: 'left', d: 'right' };
addEventListener('keydown', e => {
  if (KEYMAP[e.key]) { keys.add(KEYMAP[e.key]); e.preventDefault(); }
  else if (e.key === ' ') { throwBall(); e.preventDefault(); }
  else if (e.key === 'e') placeAtKid();
  else if (e.key === 'Enter' && G && G.phase === 'prep') startDefense();
});
addEventListener('keyup', e => { if (KEYMAP[e.key]) keys.delete(KEYMAP[e.key]); });
document.addEventListener('gesturestart', e => e.preventDefault());

if (location.search.includes('debug')) window.debugGame = () => G;
requestAnimationFrame(frame);
})();
