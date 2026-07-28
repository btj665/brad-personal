/* ============================================================================
 * GORF — REFORGED
 * A modern interpretation of the 1981 Midway arcade classic.
 *
 * Homage to the original five-mission structure:
 *   1. Astro Battles  — invader grid behind a regenerating force field
 *   2. Laser Attack   — a marching formation with heavy laser fire
 *   3. Galaxians      — swooping divers that peel from formation
 *   4. Space Warp     — attackers spiral out of a central warp, growing
 *   5. Flag Ship      — a boss dreadnought with a vulnerable core
 *
 * Clear all five to complete a Tour and earn the next rank
 * (Space Cadet -> ... -> Space Avenger). Everything is vector-drawn,
 * sound is fully synthesized via the Web Audio API.
 * ========================================================================== */

(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Canvas & core constants
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = 600, H = 800;   // logical coordinate space
  // Render the backing store at device resolution so lines stay crisp on
  // high-DPI screens (capped at 2x for performance). CSS keeps display size.
  const DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const anim = () => performance.now() / 1000; // shared animation clock (seconds)

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };

  const RANKS = [
    "Space Cadet",
    "Space Captain",
    "Space Colonel",
    "Space General",
    "Space Warrior",
    "Space Avenger",
  ];

  const MISSIONS = [
    { key: "astro",   name: "Astro Battles" },
    { key: "laser",   name: "Laser Attack" },
    { key: "galax",   name: "Galaxians" },
    { key: "warp",    name: "Space Warp" },
    { key: "flag",    name: "Flag Ship" },
  ];

  const DEBUG = location.hash === "#debug";

  // ---------------------------------------------------------------------------
  // Vector-art helpers — clean, anti-aliased ship shapes (no chunky pixels).
  // ---------------------------------------------------------------------------
  // Darken/lighten a #rrggbb color by amt (-1..1) for gradients & outlines.
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round(r + (f - r) * p);
    g = Math.round(g + (f - g) * p);
    b = Math.round(b + (f - b) * p);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  // Vertical body gradient from a light top to a darker bottom of `color`.
  function bodyGrad(color, top, bottom) {
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, shade(color, 0.35));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, -0.4));
    return g;
  }

  // Rounded-rectangle path (relative to current transform).
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------------------------------------------------------------------------
  // Audio — synthesized SFX + a robotic "voice" for Gorf's taunts
  // ---------------------------------------------------------------------------
  const Audio = (() => {
    let actx = null;
    let master = null;
    let muted = false;

    function ensure() {
      if (actx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.55;
      master.connect(actx.destination);
    }
    function resume() {
      ensure();
      if (actx && actx.state === "suspended") actx.resume();
    }

    function tone({ type = "sine", f0 = 440, f1 = f0, t = 0.15, gain = 0.3, delay = 0 }) {
      if (!actx || muted) return;
      const t0 = actx.currentTime + delay;
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + t);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + t + 0.02);
    }

    function noise({ t = 0.3, gain = 0.4, delay = 0, lp = 1800 }) {
      if (!actx || muted) return;
      const t0 = actx.currentTime + delay;
      const n = Math.floor(actx.sampleRate * t);
      const buf = actx.createBuffer(1, n, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = actx.createBufferSource();
      src.buffer = buf;
      const filter = actx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lp;
      const g = actx.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
      src.connect(filter).connect(g).connect(master);
      src.start(t0);
    }

    const sfx = {
      shoot() { tone({ type: "square", f0: 900, f1: 240, t: 0.12, gain: 0.14 }); },
      enemyShoot() { tone({ type: "sawtooth", f0: 320, f1: 120, t: 0.18, gain: 0.12 }); },
      hit() { tone({ type: "triangle", f0: 660, f1: 990, t: 0.06, gain: 0.16 }); },
      explode() { noise({ t: 0.35, gain: 0.4, lp: 1200 }); tone({ type: "sawtooth", f0: 180, f1: 40, t: 0.35, gain: 0.18 }); },
      playerHit() { noise({ t: 0.6, gain: 0.5, lp: 900 }); tone({ type: "square", f0: 200, f1: 30, t: 0.6, gain: 0.25 }); },
      shield() { tone({ type: "sine", f0: 220, f1: 120, t: 0.15, gain: 0.18 }); },
      powerup() { [0, 0.08, 0.16].forEach((d, i) => tone({ type: "square", f0: 500 + i * 260, t: 0.1, gain: 0.14, delay: d })); },
      missionClear() { [523, 659, 784, 1047].forEach((f, i) => tone({ type: "square", f0: f, t: 0.16, gain: 0.16, delay: i * 0.12 })); },
      coin() { tone({ type: "square", f0: 988, t: 0.08, gain: 0.16 }); tone({ type: "square", f0: 1319, t: 0.14, gain: 0.16, delay: 0.08 }); },
      warp() { tone({ type: "sine", f0: 80, f1: 800, t: 0.5, gain: 0.16 }); },
      gameover() { [440, 349, 261, 174].forEach((f, i) => tone({ type: "sawtooth", f0: f, t: 0.3, gain: 0.2, delay: i * 0.2 })); },
    };

    // Robotic "voice": a burst of formant-ish blips, one cluster per syllable.
    function voice(text) {
      if (!actx || muted) return;
      const syllables = Math.max(2, Math.min(10, text.replace(/[^a-z]/gi, "").length / 2));
      for (let i = 0; i < syllables; i++) {
        const base = rand(120, 200);
        tone({ type: "square", f0: base, f1: base * rand(0.8, 1.3), t: 0.09, gain: 0.09, delay: i * 0.11 });
        tone({ type: "sawtooth", f0: base * 2.5, f1: base * rand(2, 3), t: 0.07, gain: 0.05, delay: i * 0.11 });
      }
    }

    return {
      resume,
      get muted() { return muted; },
      toggleMute() { muted = !muted; return muted; },
      sfx, voice,
    };
  })();

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  const keys = new Set();
  const pressedOnce = new Set();
  const KEYMAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "up", KeyW: "up",
    ArrowDown: "down", KeyS: "down",
    Space: "fire",
    Enter: "start",
    KeyP: "pause",
    KeyM: "mute",
  };

  function keyDown(code) {
    const a = KEYMAP[code];
    if (!a) return;
    if (!keys.has(a)) pressedOnce.add(a);
    keys.add(a);
    Audio.resume();
  }
  function keyUp(code) {
    const a = KEYMAP[code];
    if (a) keys.delete(a);
  }

  window.addEventListener("keydown", (e) => {
    if (KEYMAP[e.code]) { e.preventDefault(); keyDown(e.code); }
  });
  window.addEventListener("keyup", (e) => {
    if (KEYMAP[e.code]) { e.preventDefault(); keyUp(e.code); }
  });

  // Touch controls
  (function initTouch() {
    const touch = document.getElementById("touch");
    const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    if (isTouch) touch.classList.add("show"); else touch.classList.add("hidden");
    touch.querySelectorAll(".tbtn").forEach((btn) => {
      const code = btn.dataset.key;
      const down = (e) => { e.preventDefault(); keyDown(code); };
      const up = (e) => { e.preventDefault(); keyUp(code); };
      btn.addEventListener("touchstart", down, { passive: false });
      btn.addEventListener("touchend", up, { passive: false });
      btn.addEventListener("touchcancel", up, { passive: false });
      btn.addEventListener("mousedown", down);
      btn.addEventListener("mouseup", up);
      btn.addEventListener("mouseleave", up);
    });
    canvas.addEventListener("pointerdown", () => Audio.resume());
  })();

  const consumePress = (a) => {
    if (pressedOnce.has(a)) { pressedOnce.delete(a); return true; }
    return false;
  };

  // ---------------------------------------------------------------------------
  // Starfield background
  // ---------------------------------------------------------------------------
  const stars = [];
  for (let i = 0; i < 140; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      z: rand(0.3, 1),
      size: rand(0.5, 2),
    });
  }
  function updateStars(dt) {
    for (const s of stars) {
      s.y += s.z * 40 * dt;
      if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    }
  }
  function drawStars() {
    for (const s of stars) {
      ctx.globalAlpha = 0.3 + s.z * 0.6;
      ctx.fillStyle = s.z > 0.75 ? "#bfe9ff" : "#5f74b8";
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Particles
  // ---------------------------------------------------------------------------
  const particles = [];
  function burst(x, y, color, count = 14, speed = 220) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.2, 1) * speed;
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.3, 0.7),
        maxLife: 0.7,
        color,
        size: rand(1.5, 3.5),
      });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Floating score popups
  // ---------------------------------------------------------------------------
  const popups = [];
  function popup(x, y, text, color = "#ffcf3a") {
    popups.push({ x, y, text, color, life: 1 });
  }
  function updatePopups(dt) {
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.y -= 30 * dt;
      p.life -= dt * 1.2;
      if (p.life <= 0) popups.splice(i, 1);
    }
  }
  function drawPopups() {
    ctx.textAlign = "center";
    ctx.font = "bold 16px 'Segoe UI', sans-serif";
    for (const p of popups) {
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Bullets (player) & enemy shots
  // ---------------------------------------------------------------------------
  const bullets = [];   // player projectiles
  const eshots = [];    // enemy projectiles

  function fireBullet(x, y) {
    bullets.push({ x, y, vy: -640, r: 4 });
    Audio.sfx.shoot();
  }
  const LASER_LEN = 150; // length of a Laser Attack beam line
  function enemyFire(x, y, vx = 0, vy = 260, kind = "bolt") {
    // Laser Attack fires a long vertical beam line (like the arcade original):
    // (x, y) is treated as the muzzle, and the beam hangs below it.
    if (kind === "laser") {
      eshots.push({
        x, y: y + LASER_LEN / 2, vx, vy, kind, spin: 0,
        len: LASER_LEN, hw: 3, hh: LASER_LEN / 2,
      });
    } else {
      eshots.push({ x, y, vx, vy, kind, spin: 0, hw: 4, hh: 6 });
    }
    Audio.sfx.enemyShoot();
  }

  // ---------------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------------
  const player = {
    x: W / 2, y: H - 70,
    w: 40, h: 34,
    hitW: 9, hitH: 10,   // forgiving core hitbox (smaller than the drawn ship)
    speed: 340,
    cooldown: 0,
    fireRate: 0.28,
    maxBullets: 3,
    invuln: 0,
    alive: true,
    respawn: 0,
    reset() {
      this.x = W / 2; this.y = H - 70;
      this.invuln = 2; this.alive = true; this.respawn = 0;
    },
  };

  function updatePlayer(dt) {
    if (!player.alive) {
      player.respawn -= dt;
      if (player.respawn <= 0 && game.lives > 0) player.reset();
      return;
    }
    let dx = 0, dy = 0;
    if (keys.has("left")) dx -= 1;
    if (keys.has("right")) dx += 1;
    if (keys.has("up")) dy -= 1;
    if (keys.has("down")) dy += 1;
    if (dx && dy) { dx *= 0.707; dy *= 0.707; }
    player.x += dx * player.speed * dt;
    player.y += dy * player.speed * dt;
    player.x = clamp(player.x, player.w / 2, W - player.w / 2);
    // Player is confined to the lower band of the screen (Gorf-style).
    player.y = clamp(player.y, H * 0.62, H - 40);

    player.cooldown -= dt;
    if (player.invuln > 0) player.invuln -= dt;

    if (keys.has("fire") && player.cooldown <= 0 && bullets.length < player.maxBullets) {
      fireBullet(player.x, player.y - player.h / 2);
      player.cooldown = player.fireRate;
    }
  }

  function drawPlayer() {
    if (!player.alive) return;
    // Blink while invulnerable
    if (player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0) return;
    const { x, y } = player;
    ctx.save();
    ctx.translate(x, y);

    // Engine flare
    const flare = 8 + Math.sin(performance.now() / 40) * 4;
    ctx.shadowColor = "#ff9a3a";
    ctx.shadowBlur = 12;
    const fg = ctx.createLinearGradient(0, 10, 0, 12 + flare);
    fg.addColorStop(0, "#fff2b0");
    fg.addColorStop(1, "rgba(255,120,30,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-4, 11);
    ctx.lineTo(0, 12 + flare);
    ctx.lineTo(4, 11);
    ctx.closePath();
    ctx.fill();

    // Hull — sleek fighter
    ctx.shadowColor = "#35f0ff";
    ctx.shadowBlur = 12;
    ctx.fillStyle = bodyGrad("#dff6ff", -18, 14);
    ctx.strokeStyle = "#35f0ff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -18);                 // nose
    ctx.quadraticCurveTo(3, -8, 5, 2);
    ctx.lineTo(16, 11);                 // right wingtip
    ctx.lineTo(7, 9);
    ctx.quadraticCurveTo(4, 9, 3, 12);
    ctx.lineTo(-3, 12);
    ctx.quadraticCurveTo(-4, 9, -7, 9);
    ctx.lineTo(-16, 11);                // left wingtip
    ctx.lineTo(-5, 2);
    ctx.quadraticCurveTo(-3, -8, 0, -18);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Cockpit
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ff2e6a";
    ctx.beginPath(); ctx.ellipse(0, -3, 2.2, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function damagePlayer() {
    if (player.invuln > 0 || !player.alive) return;
    player.alive = false;
    player.respawn = 1.6;
    game.lives--;
    burst(player.x, player.y, "#ff2e6a", 40, 320);
    burst(player.x, player.y, "#ffcf3a", 24, 200);
    Audio.sfx.playerHit();
    shake(18, 0.5);
    if (game.lives <= 0) {
      taunt(pick(TAUNTS.win));
      setTimeout(() => setState("gameover"), 900);
    } else {
      taunt(pick(TAUNTS.hit));
    }
  }

  // ---------------------------------------------------------------------------
  // Force field (Astro Battles) — a row of destructible shield cells
  // ---------------------------------------------------------------------------
  const shield = {
    active: false,
    cells: [],
    y: H * 0.56,
    build() {
      this.cells = [];
      this.active = true;
      const n = 24;
      const cw = W / n;
      for (let i = 0; i < n; i++) {
        this.cells.push({ x: i * cw + cw / 2, w: cw, hp: 2, max: 2 });
      }
    },
    hitAt(x, dmg = 1) {
      if (!this.active) return false;
      for (const c of this.cells) {
        if (c.hp > 0 && Math.abs(c.x - x) < c.w / 2) {
          c.hp -= dmg;
          Audio.sfx.shield();
          return true;
        }
      }
      return false;
    },
    draw() {
      if (!this.active) return;
      for (const c of this.cells) {
        if (c.hp <= 0) continue;
        const a = 0.25 + (c.hp / c.max) * 0.55;
        ctx.globalAlpha = a;
        ctx.fillStyle = c.hp > 1 ? "#35f0ff" : "#ff2e6a";
        ctx.fillRect(c.x - c.w / 2 + 1, this.y - 4, c.w - 2, 8);
      }
      ctx.globalAlpha = 1;
    },
  };

  // ---------------------------------------------------------------------------
  // Enemies
  // ---------------------------------------------------------------------------
  const enemies = [];

  function makeEnemy(opts) {
    return Object.assign({
      x: 0, y: 0, w: 30, h: 24,
      hp: 1, maxHp: 1,
      type: "grunt",
      color: "#ff2e6a",
      points: 100,
      alive: true,
      t: 0,
      // formation anchor
      hx: 0, hy: 0,
      state: "form",   // form | dive | warp
      fireChance: 0.0006,
      draw: drawGrunt,
      update: null,
    }, opts);
  }

  // ---- Enemy drawing routines (clean vector art) ----------------------------

  // Astro Battles / Space Warp — Gorfian robot: rounded body, antennae, eyes
  function drawGrunt(e) {
    const wig = Math.sin(anim() * 6 + e.x * 0.05); // antenna/leg animation
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 10;

    // Antennae
    ctx.strokeStyle = shade(e.color, 0.4);
    ctx.lineWidth = 1.6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 4, -6);
      ctx.quadraticCurveTo(s * 7, -13, s * (6 + wig * 1.5), -15);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(s * (6 + wig * 1.5), -15, 1.6, 0, Math.PI * 2); ctx.fill();
    }

    // Body
    ctx.shadowBlur = 8;
    ctx.fillStyle = bodyGrad(e.color, -9, 9);
    ctx.strokeStyle = shade(e.color, 0.5);
    ctx.lineWidth = 1.2;
    roundRect(-12, -8, 24, 15, 6);
    ctx.fill(); ctx.stroke();

    // Little legs
    ctx.shadowBlur = 0;
    ctx.strokeStyle = shade(e.color, -0.15);
    ctx.lineWidth = 2;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 6, 6);
      ctx.lineTo(s * (9 + wig), 11);
      ctx.stroke();
    }

    // Eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-4, -1, 2.6, 0, Math.PI * 2); ctx.arc(4, -1, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#12121e";
    const look = clamp((player.x - e.x) / 200, -1, 1);
    ctx.beginPath(); ctx.arc(-4 + look, -1, 1.1, 0, Math.PI * 2); ctx.arc(4 + look, -1, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Laser Attack — sleek down-firing gunship with a charging muzzle
  function drawLaserShip(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 10;

    // Swept wings
    ctx.fillStyle = bodyGrad(e.color, -8, 8);
    ctx.strokeStyle = shade(e.color, 0.5);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(14, 3);
    ctx.quadraticCurveTo(9, 6, 6, 4);
    ctx.lineTo(4, 10);
    ctx.lineTo(-4, 10);
    ctx.lineTo(-6, 4);
    ctx.quadraticCurveTo(-9, 6, -14, 3);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Cockpit
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(0, -3, 2.3, 0, Math.PI * 2); ctx.fill();

    // Charging muzzle glow at the gun tip
    const charge = 0.5 + 0.5 * Math.sin(anim() * 5 + e.x);
    ctx.shadowColor = "#ffe45e";
    ctx.shadowBlur = 6 + charge * 8;
    ctx.fillStyle = "#ffe45e";
    ctx.beginPath(); ctx.arc(0, 10, 1.6 + charge * 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Galaxians — flapping alien bird that banks with its dive angle
  function drawDiver(e) {
    const flap = Math.sin((e.t || 0) * 10) * 0.5; // wing beat
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle || 0);
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 10;

    // Wings
    ctx.fillStyle = bodyGrad(e.color, -8, 8);
    ctx.strokeStyle = shade(e.color, 0.5);
    ctx.lineWidth = 1.1;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.quadraticCurveTo(s * 10, -8 - flap * 6, s * 13, 2 + flap * 4);
      ctx.quadraticCurveTo(s * 8, 3, 0, 5);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    // Body
    ctx.shadowBlur = 6;
    ctx.fillStyle = bodyGrad(shade(e.color, 0.1), -9, 9);
    roundRect(-3.5, -9, 7, 18, 3.5);
    ctx.fill();

    // Eyes
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff7c2";
    ctx.beginPath(); ctx.arc(0, -4, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Space Warp — crystalline shard that tumbles and grows out of the vortex
  function drawWarper(e) {
    const s = clamp(e.scale || 1, 0.3, 1.6);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate((e.t || 0) * 2);
    ctx.scale(s, s);
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 12;

    // Four-point diamond shard
    ctx.fillStyle = bodyGrad(e.color, -12, 12);
    ctx.strokeStyle = shade(e.color, 0.6);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, 13);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(0, 5);
    ctx.lineTo(13, 0);
    ctx.lineTo(0, -5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Glowing core
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Boss — the Flag Ship
  // ---------------------------------------------------------------------------
  const boss = {
    active: false,
    x: W / 2, y: 150,
    w: 220, h: 96,
    // Two-phase health: chip away the armor plating, then destroy the core.
    armor: 0, armorMax: 0,
    core: 0, coreMax: 0,
    exposed: false,
    t: 0,
    dir: 1,
    fireTimer: 0,
    coreHitFlash: 0,
    hullFlash: 0,
    exposeT: 0,
    spawn(tour) {
      this.active = true;
      this.x = W / 2; this.y = 150; this.t = 0; this.dir = 1;
      this.armorMax = this.armor = 30 + tour * 12;
      this.coreMax = this.core = 10 + tour * 5;
      this.exposed = false;
      this.exposeT = 0;
      this.fireTimer = 1.4;
      this.coreHitFlash = 0;
      this.hullFlash = 0;
    },
    update(dt) {
      if (!this.active) return;
      this.t += dt;
      this.x += this.dir * (60 + game.tour * 12) * dt;
      if (this.x < this.w / 2 + 20) { this.x = this.w / 2 + 20; this.dir = 1; }
      if (this.x > W - this.w / 2 - 20) { this.x = W - this.w / 2 - 20; this.dir = -1; }
      this.y = 150 + Math.sin(this.t * 1.4) * 28;
      if (this.coreHitFlash > 0) this.coreHitFlash -= dt;
      if (this.hullFlash > 0) this.hullFlash -= dt;
      if (this.exposed) this.exposeT += dt;

      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = rand(1.0, 1.8) - game.tour * 0.08;
        // Spread barrage aimed roughly at the player
        const cx = this.x, cy = this.y + 30;
        const aim = Math.atan2(player.y - cy, player.x - cx);
        for (let i = -2; i <= 2; i++) {
          const a = aim + i * 0.18;
          enemyFire(cx, cy, Math.cos(a) * 230, Math.sin(a) * 230);
        }
      }
    },
    coreRect() {
      // Central vulnerable core (widened once exposed so it's aimable)
      const s = this.exposed ? 1 : 0.7;
      const w = 44 * s, h = 40 * s;
      return { x: this.x - w / 2, y: this.y - 2 - h / 2, w, h };
    },
    inHull(bx, by) {
      return Math.abs(bx - this.x) < this.w / 2 && Math.abs(by - this.y) < this.h / 2;
    },
    hit(bx, by) {
      if (!this.inHull(bx, by)) return false;

      // Phase 1: any hit on the ship chips away the armor plating.
      if (!this.exposed) {
        this.armor--;
        this.hullFlash = 0.08;
        Audio.sfx.hit();
        burst(bx, by, "#c39bff", 6, 140);
        if (this.armor <= 0) {
          this.exposed = true;
          this.exposeT = 0;
          shake(14, 0.4);
          Audio.sfx.powerup();
          taunt("MY ARMOR! STRIKE THE CORE... IF YOU CAN!");
        }
        return true;
      }

      // Phase 2: armor gone. Only the exposed core takes damage; shots that
      // miss it pass THROUGH the wrecked frame (return false) so the player
      // can keep firing up into the core instead of being absorbed.
      const c = this.coreRect();
      if (bx > c.x && bx < c.x + c.w && by > c.y && by < c.y + c.h) {
        this.core--;
        this.coreHitFlash = 0.12;
        Audio.sfx.hit();
        burst(bx, by, "#ffcf3a", 8, 160);
        if (this.core <= 0) this.destroy();
        return true;
      }
      return false;
    },
    destroy() {
      this.active = false;
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          burst(this.x + rand(-90, 90), this.y + rand(-40, 40), pick(["#ff2e6a", "#ffcf3a", "#35f0ff"]), 30, 300);
          Audio.sfx.explode();
        }, i * 120);
      }
      shake(26, 1);
      game.addScore(3000 + game.tour * 1000, this.x, this.y, "FLAG SHIP DOWN!");
      taunt(pick(TAUNTS.clear));
      game.missionCleared = true;
    },
    draw() {
      if (!this.active) return;
      const hw = this.w / 2, h = this.h;
      // Hull tint: intact purple, brief flash on hit, darkened once wrecked.
      const base = this.exposed ? "#3a1a5c" : this.hullFlash > 0 ? "#b07bff" : "#6a2bd6";
      const trim = this.exposed ? "#7a5a9c" : "#c39bff";
      const glow = this.exposed ? "#ff2e6a" : "#8f4bff";

      ctx.save();
      ctx.translate(this.x, this.y);

      // Hull — wide smooth dreadnought
      ctx.shadowColor = glow;
      ctx.shadowBlur = this.exposed ? 22 : 16;
      ctx.fillStyle = bodyGrad(base, -h * 0.5, h * 0.5);
      ctx.strokeStyle = trim;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-hw, 0);
      ctx.quadraticCurveTo(-hw * 0.7, -h * 0.5, -hw * 0.34, -h * 0.44);
      ctx.lineTo(hw * 0.34, -h * 0.44);
      ctx.quadraticCurveTo(hw * 0.7, -h * 0.5, hw, 0);
      ctx.quadraticCurveTo(hw * 0.6, h * 0.5, hw * 0.28, h * 0.42);
      ctx.lineTo(-hw * 0.28, h * 0.42);
      ctx.quadraticCurveTo(-hw * 0.6, h * 0.5, -hw, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Bridge
      ctx.shadowBlur = 0;
      ctx.fillStyle = shade(base, 0.18);
      ctx.beginPath();
      ctx.moveTo(-28, -h * 0.44);
      ctx.lineTo(-15, -h * 0.5);
      ctx.lineTo(15, -h * 0.5);
      ctx.lineTo(28, -h * 0.44);
      ctx.closePath();
      ctx.fill();

      // Wing pods + panel accents
      ctx.fillStyle = shade(base, -0.25);
      roundRect(-hw - 3, -9, 13, 18, 4); ctx.fill();
      roundRect(hw - 10, -9, 13, 18, 4); ctx.fill();
      ctx.strokeStyle = shade(trim, -0.2);
      ctx.lineWidth = 1;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 40, -h * 0.3);
        ctx.lineTo(s * 70, h * 0.2);
        ctx.stroke();
      }

      // Core — shielded/blue in phase 1, large pulsing red once exposed
      const flash = this.coreHitFlash > 0;
      if (this.exposed) {
        const r = 20 + Math.sin(this.t * 8) * 3;
        ctx.shadowColor = flash ? "#ffffff" : "#ff2e6a";
        ctx.shadowBlur = 24;
        ctx.fillStyle = flash ? "#ffffff" : "#ff3a5a";
        ctx.beginPath(); ctx.arc(0, -2, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffcf3a";
        ctx.beginPath(); ctx.arc(0, -2, r * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#2a0033";
        ctx.beginPath(); ctx.arc(0, -2, r * 0.22, 0, Math.PI * 2); ctx.fill();
      } else {
        // Sealed core behind the plating
        ctx.shadowColor = "#35a0ff";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#2b6fb0";
        ctx.beginPath(); ctx.arc(0, 2, 11, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#0a1a33";
        ctx.beginPath(); ctx.arc(0, 2, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      // Health bar: armor (purple) in phase 1, core (red) in phase 2.
      // Sits below the top HUD row so it never overlaps the mission label.
      const bw = 260, bx = W / 2 - bw / 2, by = 62;
      const frac = this.exposed
        ? clamp(this.core / this.coreMax, 0, 1)
        : clamp(this.armor / this.armorMax, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(bx - 2, by - 2, bw + 4, 12);
      ctx.fillStyle = "#22103a";
      ctx.fillRect(bx, by, bw, 8);
      ctx.fillStyle = this.exposed ? "#ff2e6a" : "#8f4bff";
      ctx.fillRect(bx, by, bw * frac, 8);
      ctx.textAlign = "center";
      ctx.font = "bold 11px 'Segoe UI', sans-serif";
      ctx.fillStyle = this.exposed ? "#ff8fb0" : "#c39bff";
      ctx.fillText(this.exposed ? "CORE EXPOSED — FIRE!" : "ARMOR", W / 2, by - 5);
    },
  };

  // ---------------------------------------------------------------------------
  // Mission setup
  // ---------------------------------------------------------------------------
  function clearField() {
    enemies.length = 0;
    bullets.length = 0;
    eshots.length = 0;
    shield.active = false;
    boss.active = false;
  }

  function buildFormation(rows, cols, opts = {}) {
    const marginX = 70, spacingX = (W - marginX * 2) / (cols - 1);
    const startY = 110, spacingY = 46;
    const speedTint = game.tour;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const hx = marginX + c * spacingX;
        const hy = startY + r * spacingY;
        const color = r === 0 ? "#ffcf3a" : r < 2 ? "#ff2e6a" : "#35f0ff";
        const e = makeEnemy(Object.assign({
          x: hx, y: hy - 300, hx, hy,
          color,
          points: (rows - r) * 50 + 50,
          fireChance: (0.0004 + speedTint * 0.00015) * (opts.fireMul || 1),
          draw: drawGrunt,
        }, opts.enemy || {}));
        enemies.push(e);
      }
    }
  }

  // Formation drift shared by grid-based missions
  const formation = { offset: 0, dir: 1, speed: 26, drop: 0, phase: 0 };

  function startMission() {
    clearField();
    formation.offset = 0; formation.dir = 1; formation.drop = 0; formation.phase = 0;
    game.missionCleared = false;
    const m = MISSIONS[game.mission];
    formation.speed = 22 + game.tour * 6 + game.mission * 3;

    if (m.key === "astro") {
      shield.build();
      buildFormation(4, 8, { fireMul: 0.8 });
    } else if (m.key === "laser") {
      buildFormation(4, 9, { fireMul: 1.0, enemy: { draw: drawLaserShip } });
    } else if (m.key === "galax") {
      buildFormation(3, 8, { fireMul: 1.2, enemy: { draw: drawDiver } });
    } else if (m.key === "warp") {
      buildWarp();
      Audio.sfx.warp();
    } else if (m.key === "flag") {
      boss.spawn(game.tour);
    }

    setState("intro");
    taunt(pick(TAUNTS.intro));
  }

  function buildWarp() {
    const count = 12 + game.tour * 3;
    for (let i = 0; i < count; i++) {
      const e = makeEnemy({
        x: W / 2, y: H * 0.32,
        color: pick(["#8f4bff", "#35f0ff", "#ff2e6a"]),
        points: 150,
        draw: drawWarper,
        state: "warp",
        scale: 0.1,
        angle0: rand(0, Math.PI * 2),
        radius: 0,
        spin: rand(1.6, 2.6) * (Math.random() < 0.5 ? 1 : -1),
        grow: rand(28, 46),
        delay: i * 0.35,
        fireChance: 0.001 + game.tour * 0.0003,
      });
      enemies.push(e);
    }
  }

  // ---------------------------------------------------------------------------
  // Enemy update per mission behavior
  // ---------------------------------------------------------------------------
  function updateEnemies(dt) {
    const m = MISSIONS[game.mission];

    // Grid formation drift (astro / laser / galax base positions)
    if (m.key === "astro" || m.key === "laser" || m.key === "galax") {
      formation.phase += dt;
      formation.offset += formation.dir * formation.speed * dt;
      let edgeHit = false;
      const amp = 60 + game.tour * 6;
      if (formation.offset > amp) { formation.offset = amp; edgeHit = true; }
      if (formation.offset < -amp) { formation.offset = -amp; edgeHit = true; }
      if (edgeHit) { formation.dir *= -1; formation.drop += 12; }
    }

    for (const e of enemies) {
      if (!e.alive) continue;
      e.t += dt;

      if (e.state === "warp") {
        updateWarper(e, dt);
      } else if (e.state === "dive") {
        updateDiver(e, dt);
      } else {
        // In-formation
        const bob = Math.sin(formation.phase * 2 + e.hx * 0.03) * 4;
        e.x = e.hx + formation.offset;
        e.y = e.hy + formation.drop + bob;
        // Descend into view at start
        if (e.y > e.hy + formation.drop + bob) e.y = e.hy + formation.drop + bob;

        // Galaxians peel off and dive
        if (m.key === "galax" && Math.random() < 0.0009 * (1 + game.tour * 0.3)) {
          startDive(e);
        }
        // Formation fire
        if (Math.random() < e.fireChance) {
          if (m.key === "laser") {
            enemyFire(e.x, e.y + 14, 0, 240, "laser");
          } else {
            const aim = Math.atan2(player.y - e.y, player.x - e.x);
            enemyFire(e.x, e.y + 12, Math.cos(aim) * 150, Math.abs(Math.sin(aim)) * 150 + 160);
          }
        }
      }

      // Only a marching-formation invader that reaches the bottom counts as
      // "landed" — divers and warp attackers are meant to fly past and loop.
      if (e.state === "form" && e.y > H - 60) {
        e.alive = false;
        burst(e.x, e.y, e.color, 12);
        damagePlayer();
      }
    }

    // Purge dead
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (!enemies[i].alive) enemies.splice(i, 1);
    }
  }

  function startDive(e) {
    e.state = "dive";
    e.diveT = 0;
    e.startX = e.x;
    e.startY = e.y;
    e.sway = rand(60, 140) * (Math.random() < 0.5 ? 1 : -1);
    e.targetX = clamp(player.x + rand(-60, 60), 40, W - 40);
    e.angle = 0;
  }

  function updateDiver(e, dt) {
    e.diveT += dt;
    const speed = 240 + game.tour * 20;
    e.y += speed * dt;
    // Sinusoidal weave toward the player's column
    const tx = e.targetX + Math.sin(e.diveT * 4) * e.sway;
    e.x += (tx - e.x) * clamp(dt * 3, 0, 1);
    e.angle = Math.sin(e.diveT * 4) * 0.4;

    if (Math.random() < 0.004) enemyFire(e.x, e.y + 10, 0, 300);

    if (e.y > H + 30) {
      // Loop back to top and rejoin
      e.y = -20;
      e.state = "form";
      e.diveT = 0;
    }
  }

  function updateWarper(e, dt) {
    if (e.delay > 0) { e.delay -= dt; return; }
    e.radius += e.grow * dt;
    e.angle0 += e.spin * dt;
    e.scale = clamp(0.1 + e.radius / 260, 0.1, 1.5);
    const cx = W / 2, cy = H * 0.32;
    e.x = cx + Math.cos(e.angle0) * e.radius;
    e.y = cy + Math.sin(e.angle0) * e.radius * 0.75 + e.radius * 0.35;
    if (Math.random() < e.fireChance) {
      const aim = Math.atan2(player.y - e.y, player.x - e.x);
      enemyFire(e.x, e.y, Math.cos(aim) * 200, Math.sin(aim) * 200);
    }
    // Off screen -> respawn from center
    if (e.y > H + 40 || e.x < -40 || e.x > W + 40) {
      e.radius = 0; e.scale = 0.1; e.delay = rand(0.3, 1.2);
      e.angle0 = rand(0, Math.PI * 2);
    }
  }

  function drawEnemies() {
    for (const e of enemies) if (e.alive) e.draw(e);
  }

  // ---------------------------------------------------------------------------
  // Collisions
  // ---------------------------------------------------------------------------
  function collide() {
    // Player bullets vs enemies / boss / shield
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      let hit = false;

      if (boss.active && boss.hit(b.x, b.y)) { hit = true; }

      if (!hit) {
        for (const e of enemies) {
          if (!e.alive) continue;
          if (Math.abs(b.x - e.x) < e.w / 2 && Math.abs(b.y - e.y) < e.h / 2) {
            e.hp--;
            hit = true;
            if (e.hp <= 0) {
              e.alive = false;
              burst(e.x, e.y, e.color, 16, 240);
              Audio.sfx.explode();
              game.addScore(e.points, e.x, e.y);
            } else {
              Audio.sfx.hit();
            }
            break;
          }
        }
      }

      if (!hit && shield.active && Math.abs(b.y - shield.y) < 8) {
        if (shield.hitAt(b.x)) hit = true;
      }

      if (hit) bullets.splice(i, 1);
    }

    // Enemy shots vs player / shield (box overlap using each shot's hitbox)
    for (let i = eshots.length - 1; i >= 0; i--) {
      const s = eshots[i];
      // Shield sits above the player and blocks incoming fire in Astro Battles.
      if (shield.active && Math.abs(s.y - shield.y) < 8 && s.vy > 0) {
        if (shield.hitAt(s.x)) { eshots.splice(i, 1); continue; }
      }
      if (player.alive && player.invuln <= 0 &&
          Math.abs(s.x - player.x) < s.hw + player.hitW &&
          Math.abs(s.y - player.y) < s.hh + player.hitH) {
        if (DEBUG) console.log("DEATH by SHOT kind=" + s.kind +
          " dx=" + Math.abs(s.x - player.x).toFixed(1) + " dy=" + Math.abs(s.y - player.y).toFixed(1));
        eshots.splice(i, 1);
        damagePlayer();
        continue;
      }
    }

    // Enemy body vs player
    if (player.alive && player.invuln <= 0) {
      for (const e of enemies) {
        if (!e.alive) continue;
        if (Math.abs(e.x - player.x) < e.w / 2 + player.hitW &&
            Math.abs(e.y - player.y) < e.h / 2 + player.hitH) {
          e.alive = false;
          burst(e.x, e.y, e.color, 18);
          Audio.sfx.explode();
          damagePlayer();
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Bullets / shots update + draw
  // ---------------------------------------------------------------------------
  function updateShots(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.y += b.vy * dt;
      if (b.y < -10) bullets.splice(i, 1);
    }
    for (let i = eshots.length - 1; i >= 0; i--) {
      const s = eshots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.spin += dt * 10;
      // Remove once fully off-screen (account for a long beam's half-length).
      const half = s.hh || 6;
      if (s.y - half > H + 10 || s.y + half < -10 || s.x < -20 || s.x > W + 20) {
        eshots.splice(i, 1);
      }
    }
  }

  function drawShots() {
    // Player bolts
    for (const b of bullets) {
      ctx.save();
      ctx.shadowColor = "#35f0ff";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#eaffff";
      ctx.fillRect(b.x - 2, b.y - 10, 4, 16);
      ctx.restore();
    }
    // Enemy fire
    for (const s of eshots) {
      if (s.kind === "laser") {
        // Long continuous laser line streaking down the column (arcade-style)
        const L = s.len || 150;
        const top = s.y - L / 2;
        ctx.save();
        ctx.shadowColor = "#ffcf3a";
        ctx.shadowBlur = 12;
        ctx.fillStyle = "#ff8a1e";           // amber outer beam
        ctx.fillRect(s.x - 3, top, 6, L);
        ctx.fillStyle = "#ffe45e";           // bright yellow body
        ctx.fillRect(s.x - 1.5, top, 3, L);
        ctx.fillStyle = "#fffdf0";           // hot white core
        ctx.fillRect(s.x - 0.5, top, 1, L);
        // Muzzle spark at the top of the beam
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#fff3b0";
        ctx.fillRect(s.x - 4, top - 2, 8, 5);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.spin);
        ctx.shadowColor = "#ff2e6a";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "#ffbcd0";
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4, 4);
        ctx.lineTo(0, 2);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Screen shake
  // ---------------------------------------------------------------------------
  let shakeMag = 0, shakeT = 0;
  function shake(mag, t) { shakeMag = Math.max(shakeMag, mag); shakeT = Math.max(shakeT, t); }
  function applyShake(dt) {
    if (shakeT > 0) {
      shakeT -= dt;
      const m = shakeMag * (shakeT > 0 ? 1 : 0);
      ctx.translate(rand(-m, m), rand(-m, m));
      if (shakeT <= 0) shakeMag = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Taunts (Gorf's personality) — original paraphrases in the arcade spirit
  // ---------------------------------------------------------------------------
  const TAUNTS = {
    intro: [
      "PREPARE FOR ANNIHILATION!",
      "YOU CANNOT WIN, DEFENDER.",
      "MY EMPIRE IS ENDLESS.",
      "ANOTHER FOOL APPROACHES.",
    ],
    hit: [
      "BAD MOVE, SPACE CADET!",
      "SOME DEFENDER YOU ARE!",
      "PATHETIC!",
      "IS THAT ALL YOU HAVE?",
    ],
    clear: [
      "IMPOSSIBLE... FOR NOW.",
      "YOU WILL NOT BE SO LUCKY NEXT TIME.",
      "LUCKY SHOT, CADET.",
      "THE EMPIRE REMEMBERS THIS.",
    ],
    win: [
      "GORF WINS. AS ALWAYS.",
      "YOUR DEFENSE HAS FAILED.",
      "THE GALAXY IS MINE.",
    ],
    promote: [
      "YOU DARE RISE IN RANK?",
      "A HIGHER RANK. A HARDER FALL.",
    ],
  };
  const pick = (arr) => arr[randInt(0, arr.length - 1)];

  const speech = { text: "", life: 0 };
  function taunt(text) {
    speech.text = text;
    speech.life = 2.6;
    Audio.voice(text);
  }
  function updateSpeech(dt) { if (speech.life > 0) speech.life -= dt; }
  function drawSpeech() {
    if (speech.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(speech.life / 2.6, 0, 1);
    ctx.textAlign = "center";
    ctx.font = "italic bold 20px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#8f4bff";
    ctx.shadowColor = "#8f4bff";
    ctx.shadowBlur = 14;
    ctx.fillText("◢ GORF: " + speech.text, W / 2, H * 0.46);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Game state machine
  // ---------------------------------------------------------------------------
  const game = {
    state: "title",     // title | intro | playing | paused | cleared | tourcomplete | gameover
    score: 0,
    hiscore: Number(localStorage.getItem("gorf_hi") || 0),
    lives: 3,
    tour: 0,            // completed tours -> rank index
    mission: 0,
    stateT: 0,
    missionCleared: false,

    addScore(pts, x, y, label) {
      this.score += pts;
      if (x != null) popup(x, y, label || ("+" + pts), label ? "#8f4bff" : "#ffcf3a");
      if (this.score > this.hiscore) {
        this.hiscore = this.score;
        localStorage.setItem("gorf_hi", String(this.hiscore));
      }
    },

    newGame() {
      this.score = 0;
      this.lives = 3;
      this.tour = 0;
      this.mission = 0;
      player.reset();
      Audio.sfx.coin();
      startMission();
    },
  };

  function setState(s) { game.state = s; game.stateT = 0; }

  // Optional debug hook: open with URL hash #debug to expose mission jumping.
  // Inert during normal play; used for previewing/testing the five missions.
  if (location.hash === "#debug") {
    window.__gorf = {
      go(missionIndex = 0, tour = 0) {
        game.score = game.score || 0;
        game.lives = 3;
        game.tour = tour;
        game.mission = clamp(missionIndex, 0, MISSIONS.length - 1);
        player.reset();
        startMission();
        setState("playing");
      },
      lives(n) { game.lives = n; },
      state() { return { state: game.state, lives: game.lives, enemies: enemies.length, eshots: eshots.length }; },
      boss() { return { active: boss.active, x: boss.x, armor: boss.armor, core: boss.core, exposed: boss.exposed, cleared: game.missionCleared }; },
      aimX(px) { player.x = clamp(px, player.w / 2, W - player.w / 2); },
    };
  }

  function nextMission() {
    game.mission++;
    if (game.mission >= MISSIONS.length) {
      // Tour complete -> promote
      game.mission = 0;
      game.tour++;
      game.lives = Math.min(game.lives + 1, 6);
      Audio.sfx.powerup();
      taunt(pick(TAUNTS.promote));
      setState("tourcomplete");
    } else {
      startMission();
    }
  }

  function checkMissionEnd() {
    const m = MISSIONS[game.mission];
    let done = false;
    if (m.key === "flag") {
      done = game.missionCleared;
    } else {
      done = enemies.length === 0;
    }
    if (done && game.state === "playing") {
      Audio.sfx.missionClear();
      if (m.key !== "flag") { taunt(pick(TAUNTS.clear)); }
      game.addScore(500 + game.tour * 250, W / 2, H * 0.5, "MISSION CLEAR +" + (500 + game.tour * 250));
      setState("cleared");
    }
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------
  // Arcade-style mission name across the bottom (as in the original cabinet).
  function drawMissionBanner() {
    const m = MISSIONS[game.mission];
    ctx.save();
    ctx.textAlign = "center";
    ctx.shadowColor = "#ffcf3a";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffcf3a";
    ctx.font = "900 20px 'Segoe UI', sans-serif";
    ctx.fillText(m.name.toUpperCase(), W / 2, H - 12);
    ctx.restore();
  }

  function drawHUD() {
    ctx.save();
    ctx.textAlign = "left";
    ctx.font = "bold 16px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#35f0ff";
    ctx.fillText("SCORE " + game.score.toString().padStart(6, "0"), 14, 24);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffcf3a";
    ctx.fillText("HI " + game.hiscore.toString().padStart(6, "0"), W / 2, 24);
    ctx.font = "bold 11px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#8f7acc";
    ctx.fillText("MISSION " + (game.mission + 1), W / 2, 42);

    ctx.textAlign = "right";
    ctx.fillStyle = "#c39bff";
    ctx.fillText(RANKS[Math.min(game.tour, RANKS.length - 1)], W - 14, 24);

    // Lives (ships)
    for (let i = 0; i < game.lives; i++) {
      const lx = 18 + i * 22, ly = 44;
      ctx.fillStyle = "#e8fbff";
      ctx.beginPath();
      ctx.moveTo(lx, ly - 8);
      ctx.lineTo(lx + 7, ly + 6);
      ctx.lineTo(lx - 7, ly + 6);
      ctx.closePath();
      ctx.fill();
    }

    // Mission pips
    const my = 44;
    for (let i = 0; i < MISSIONS.length; i++) {
      const mx = W - 16 - (MISSIONS.length - 1 - i) * 18;
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      if (i < game.mission) ctx.fillStyle = "#35f0ff";
      else if (i === game.mission) ctx.fillStyle = "#ffcf3a";
      else ctx.fillStyle = "#333a5c";
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Overlay screens
  // ---------------------------------------------------------------------------
  function centerText(lines) {
    ctx.textAlign = "center";
    let y = H * 0.32;
    for (const l of lines) {
      ctx.font = l.font || "bold 22px 'Segoe UI', sans-serif";
      ctx.fillStyle = l.color || "#dbe7ff";
      if (l.glow) { ctx.shadowColor = l.color || "#35f0ff"; ctx.shadowBlur = 16; }
      ctx.fillText(l.text, W / 2, y);
      ctx.shadowBlur = 0;
      y += l.gap || 34;
    }
  }

  function drawTitle() {
    // Big logo
    ctx.save();
    ctx.textAlign = "center";
    const pulse = 1 + Math.sin(performance.now() / 400) * 0.03;
    ctx.translate(W / 2, H * 0.26);
    ctx.scale(pulse, pulse);
    ctx.font = "900 92px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = "#35f0ff";
    ctx.shadowColor = "#35f0ff";
    ctx.shadowBlur = 30;
    ctx.fillText("GORF", 0, 0);
    ctx.shadowBlur = 0;
    ctx.font = "bold 20px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#ff2e6a";
    ctx.fillText("R E F O R G E D", 0, 40);
    ctx.restore();

    centerText([
      { text: "GALACTIC ORBITING ROBOT FORCE", color: "#c39bff", font: "bold 15px 'Segoe UI'", gap: 44 },
      { text: (isTouchDevice() ? "TAP FIRE" : "PRESS ENTER OR SPACE"), color: "#ffcf3a", font: "bold 22px 'Segoe UI'", glow: true, gap: 40 },
      { text: "TO INSERT COIN", color: "#ffcf3a", font: "bold 22px 'Segoe UI'", glow: true, gap: 60 },
    ]);

    ctx.textAlign = "center";
    ctx.font = "14px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#7f8fc4";
    const missions = MISSIONS.map((m, i) => (i + 1) + ". " + m.name).join("    ");
    ctx.fillText("FIVE MISSIONS AWAIT", W / 2, H * 0.66);
    ctx.fillStyle = "#5f74b8";
    ctx.font = "12px 'Segoe UI', sans-serif";
    MISSIONS.forEach((m, i) => {
      ctx.fillText((i + 1) + ".  " + m.name.toUpperCase(), W / 2, H * 0.7 + i * 20);
    });

    if (game.hiscore > 0) {
      ctx.fillStyle = "#ffcf3a";
      ctx.font = "bold 14px 'Segoe UI'";
      ctx.fillText("BEST  " + game.hiscore.toString().padStart(6, "0"), W / 2, H * 0.92);
    }
  }

  function drawIntro() {
    const m = MISSIONS[game.mission];
    centerText([
      { text: "MISSION " + (game.mission + 1), color: "#35f0ff", font: "bold 24px 'Segoe UI'", gap: 40 },
      { text: m.name.toUpperCase(), color: "#ffcf3a", font: "900 40px 'Segoe UI'", glow: true, gap: 46 },
      { text: RANKS[Math.min(game.tour, RANKS.length - 1)] + "  •  TOUR " + (game.tour + 1), color: "#c39bff", font: "bold 16px 'Segoe UI'", gap: 30 },
    ]);
  }

  function drawCleared() {
    centerText([
      { text: "MISSION CLEAR", color: "#35f0ff", font: "900 40px 'Segoe UI'", glow: true, gap: 46 },
      { text: MISSIONS[game.mission].name.toUpperCase() + " SECURED", color: "#dbe7ff", font: "bold 18px 'Segoe UI'", gap: 40 },
    ]);
  }

  function drawTourComplete() {
    centerText([
      { text: "TOUR COMPLETE", color: "#ffcf3a", font: "900 38px 'Segoe UI'", glow: true, gap: 44 },
      { text: "PROMOTED TO", color: "#dbe7ff", font: "bold 16px 'Segoe UI'", gap: 34 },
      { text: RANKS[Math.min(game.tour, RANKS.length - 1)].toUpperCase(), color: "#35f0ff", font: "900 30px 'Segoe UI'", glow: true, gap: 46 },
      { text: "Enemies grow stronger...", color: "#c39bff", font: "italic 15px 'Segoe UI'", gap: 30 },
    ]);
  }

  function drawGameOver() {
    centerText([
      { text: "GAME OVER", color: "#ff2e6a", font: "900 52px 'Segoe UI'", glow: true, gap: 56 },
      { text: "FINAL SCORE  " + game.score.toString().padStart(6, "0"), color: "#dbe7ff", font: "bold 20px 'Segoe UI'", gap: 32 },
      { text: "RANK REACHED: " + RANKS[Math.min(game.tour, RANKS.length - 1)], color: "#c39bff", font: "bold 16px 'Segoe UI'", gap: 30 },
      { text: (game.score >= game.hiscore ? "★ NEW BEST ★" : ""), color: "#ffcf3a", font: "bold 18px 'Segoe UI'", glow: true, gap: 44 },
      { text: (isTouchDevice() ? "TAP FIRE TO REPLAY" : "PRESS ENTER TO REPLAY"), color: "#ffcf3a", font: "bold 18px 'Segoe UI'", gap: 30 },
    ]);
  }

  function overlayBG(alpha = 0.55) {
    ctx.fillStyle = `rgba(4, 1, 12, ${alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  function isTouchDevice() {
    return window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  let last = performance.now();

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.05); // clamp for stability

    // --- Global inputs ---
    if (consumePress("mute")) {
      const m = Audio.toggleMute();
      if (!m) Audio.sfx.hit();
    }

    update(dt);
    render();

    requestAnimationFrame(frame);
  }

  function update(dt) {
    updateStars(dt);
    updateParticles(dt);
    updatePopups(dt);
    updateSpeech(dt);
    game.stateT += dt;

    switch (game.state) {
      case "title":
        if (consumePress("start") || consumePress("fire")) game.newGame();
        break;

      case "intro":
        if (game.stateT > 2.0 || consumePress("fire")) setState("playing");
        // Still animate enemies descending during intro for flair
        break;

      case "playing": {
        if (consumePress("pause")) { setState("paused"); break; }
        updatePlayer(dt);
        updateEnemies(dt);
        boss.update(dt);
        updateShots(dt);
        collide();
        checkMissionEnd();
        break;
      }

      case "paused":
        if (consumePress("pause") || consumePress("fire")) setState("playing");
        break;

      case "cleared":
        if (game.stateT > 2.2) nextMission();
        break;

      case "tourcomplete":
        if (game.stateT > 3.0 || consumePress("fire")) startMission();
        break;

      case "gameover":
        if (game.stateT > 0.8 && (consumePress("start") || consumePress("fire"))) {
          game.newGame();
        }
        break;
    }

    applyShakeReset();
  }

  // Shake is applied at render time; reset transform handled there.
  function applyShakeReset() {}

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); // map logical units to device pixels
    ctx.clearRect(0, 0, W, H);

    // Background gradient wash
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0a0524");
    bg.addColorStop(1, "#04010c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    applyShake(1 / 60);
    drawStars();

    // Warp swirl backdrop for Space Warp mission
    if (game.state !== "title" && MISSIONS[game.mission].key === "warp" &&
        (game.state === "playing" || game.state === "intro")) {
      drawWarpBackdrop();
    }

    if (game.state === "title") {
      drawParticles();
      drawTitle();
      ctx.restore();
      drawFrameEdge();
      return;
    }

    // World
    shield.draw();
    drawEnemies();
    boss.draw();
    drawShots();
    drawPlayer();
    drawParticles();
    drawPopups();
    drawSpeech();

    ctx.restore();

    // HUD & overlays (no shake)
    drawHUD();
    if (game.state === "playing" || game.state === "cleared") drawMissionBanner();

    if (game.state === "intro") { overlayBG(0.35); drawIntro(); }
    if (game.state === "paused") { overlayBG(0.6); centerText([
      { text: "PAUSED", color: "#35f0ff", font: "900 44px 'Segoe UI'", glow: true, gap: 46 },
      { text: "Press P to resume", color: "#c39bff", font: "bold 16px 'Segoe UI'", gap: 30 },
    ]); }
    if (game.state === "cleared") { overlayBG(0.4); drawCleared(); }
    if (game.state === "tourcomplete") { overlayBG(0.55); drawTourComplete(); }
    if (game.state === "gameover") { overlayBG(0.72); drawGameOver(); }

    if (Audio.muted) {
      ctx.textAlign = "right";
      ctx.font = "bold 12px 'Segoe UI'";
      ctx.fillStyle = "#ff2e6a";
      ctx.fillText("MUTED", W - 14, H - 12);
    }

    drawFrameEdge();
  }

  function drawWarpBackdrop() {
    const cx = W / 2, cy = H * 0.32;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.translate(cx, cy);
    const t = performance.now() / 1000;
    for (let i = 0; i < 6; i++) {
      ctx.rotate(t * 0.3 + i);
      ctx.strokeStyle = i % 2 ? "#8f4bff" : "#35f0ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 20 + i * 26 + Math.sin(t + i) * 8, 0, Math.PI * 1.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFrameEdge() {
    ctx.strokeStyle = "rgba(53,240,255,0.15)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }

  requestAnimationFrame(frame);
})();
