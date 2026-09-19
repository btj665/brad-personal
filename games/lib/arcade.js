/* =========================================================================
   arcade.js — the BaldyCade house engine
   -------------------------------------------------------------------------
   Everything the Galaga rebuild needed, extracted so every cabinet in the
   arcade is built the same way:

     - a fixed native resolution, integer-scaled with nearest-neighbour
     - hand-authored pixel sprites, pre-rotated into fixed frames
     - a bitmap font, not the browser's
     - synthesised audio, no samples
     - a fixed-timestep loop so behaviour never depends on frame rate

   No dependencies. Load with <script src="../lib/arcade.js"></script>, or
   paste inline. Exposes one global: Arcade.
   ========================================================================= */
(function (root) {
'use strict';

var Arcade = {};

/* =========================================================================
   PALETTES — period-correct hardware colours
   ========================================================================= */
Arcade.palettes = {
  /* Namco (Galaga, Pac-Man, Dig Dug, Rally-X) */
  namco: {
    black:'#000000', white:'#ffffff', red:'#f83800', red2:'#d82800',
    blue:'#0058f8', cyan:'#3cbcfc', green:'#00b800', yellow:'#fcd800',
    magenta:'#f878f8', cream:'#fcfcd8', purple:'#b800b8', orange:'#fc9838'
  },
  /* Atari raster (Centipede, Millipede) */
  atari: {
    black:'#000000', white:'#ffffff', red:'#d82800', orange:'#fca044',
    yellow:'#fcfc00', green:'#00d800', cyan:'#00d8d8', blue:'#0070ec',
    magenta:'#d800cc', tan:'#fcbcb0'
  },
  /* Nintendo (Donkey Kong, Mario Bros.) */
  nintendo: {
    black:'#000000', white:'#ffffff', red:'#fc0000', skin:'#ffa07a',
    blue:'#0000fc', cyan:'#3cbcfc', yellow:'#fcd800', brown:'#a04000',
    pink:'#fca4c4', green:'#00a800'
  },
  /* Vector monochrome (Asteroids, Lunar Lander) */
  vector: {
    black:'#000000', white:'#ffffff', dim:'#9a9a9a', faint:'#4a4a4a'
  },
  /* Williams (Defender, Robotron, Joust) — hot and saturated */
  williams: {
    black:'#000000', white:'#ffffff', red:'#ff2020', orange:'#ff8000',
    yellow:'#ffff20', green:'#20ff20', cyan:'#20ffff', blue:'#4060ff',
    magenta:'#ff40ff', grey:'#909090'
  }
};

/* =========================================================================
   SCREEN — native-resolution canvas, integer-scaled
   -------------------------------------------------------------------------
   The single most important thing for "arcade realistic": render at the
   board's true resolution and scale up by a whole number with smoothing
   off. Fractional scaling is what makes a pixel game look like a web page.
   ========================================================================= */
Arcade.Screen = function (opts) {
  opts = opts || {};
  var w = opts.width || 224, h = opts.height || 288;
  var canvas = opts.canvas || document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  var ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  var api = {
    canvas: canvas, ctx: ctx, width: w, height: h, scale: 1,

    /* Integer scale to fit the box, falling back to fractional only when
       even 1x will not fit (very small phones). */
    fit: function (availW, availH) {
      var s = Math.min(availW / w, availH / h);
      var si = Math.floor(s);
      api.scale = si >= 1 ? si : s;
      canvas.style.width = (w * api.scale) + 'px';
      canvas.style.height = (h * api.scale) + 'px';
      return api.scale;
    },

    clear: function (col) {
      ctx.fillStyle = col || '#000';
      ctx.fillRect(0, 0, w, h);
    },

    /* Canvas coords from a pointer event — needed for touch controls. */
    pointerPos: function (ev) {
      var r = canvas.getBoundingClientRect();
      return {
        x: (ev.clientX - r.left) / r.width * w,
        y: (ev.clientY - r.top) / r.height * h
      };
    },

    px: function (x, y, col) {
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    },
    rect: function (x, y, rw, rh, col) {
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(rw), Math.round(rh));
    }
  };
  return api;
};

/* =========================================================================
   FONT — 8x8 bitmap glyphs
   -------------------------------------------------------------------------
   Arcade text is part of the art. A system font at 11px beside pixel
   sprites is the single clearest tell that a game is a web page.
   ========================================================================= */
var DEFAULT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-!?%/()*+=<>'©";
var DEFAULT_HEX = [
 "183C66667E666600","7C66667C66667C00","3C66606060663C00","786C6666666C7800",
 "7E60607C60607E00","7E60607C60606000","3C66606E66663E00","6666667E66666600",
 "3C18181818183C00","1E0C0C0C0C6C3800","666C7870786C6600","6060606060607E00",
 "63777F6B63636300","66767E7E6E666600","3C66666666663C00","7C66667C60606000",
 "3C6666666E6C3600","7C66667C786C6600","3E60603C06067C00","7E18181818181800",
 "6666666666663C00","66666666663C1800","63636B6B7F776300","66663C183C666600",
 "6666663C18181800","7E060C1830607E00",
 "3C666E7E76663C00","1838181818187E00","3C66060C18307E00","3C66061C06663C00",
 "0C1C3C6C7E0C0C00","7E607C0606663C00","1C30607C66663C00","7E060C1830303000",
 "3C66663C66663C00","3C66663E060C3800",
 "0000000000000000","0000000000181800","0000000018183000","0018180018180000",
 "0000007E00000000","1818181818001800","3C66060C18001800","62660C1830664600",
 "060C18183060C000","0C18303030180C00","30180C0C0C183000","00663CFF3C660000",
 "0018187E18180000","00007E007E000000","0C18306030180C00","30180C060C183000",
 "0000183060000000","3C42994181423C00"
];

Arcade.Font = function (chars, hex, cell) {
  chars = chars || DEFAULT_CHARS;
  hex = hex || DEFAULT_HEX;
  cell = cell || 8;

  var rowsFor = {};
  for (var i = 0; i < chars.length; i++) {
    var h = hex[i] || "0000000000000000";
    var rows = [];
    for (var r = 0; r < cell; r++) rows.push(parseInt(h.substr(r * 2, 2), 16));
    rowsFor[chars[i]] = rows;
  }

  var cache = {};
  function glyph(ch, col) {
    var key = ch + col;
    if (cache[key]) return cache[key];
    var rows = rowsFor[ch] || rowsFor[' '];
    var c = document.createElement('canvas');
    c.width = cell; c.height = cell;
    var g = c.getContext('2d');
    g.fillStyle = col;
    for (var y = 0; y < cell; y++) {
      for (var x = 0; x < cell; x++) {
        if (rows[y] & (0x80 >> x)) g.fillRect(x, y, 1, 1);
      }
    }
    cache[key] = c;
    return c;
  }

  return {
    cell: cell,
    width: function (str, scale) { return String(str).length * cell * (scale || 1); },

    draw: function (ctx, str, x, y, col, scale) {
      scale = scale || 1;
      str = String(str).toUpperCase();
      for (var i = 0; i < str.length; i++) {
        if (str[i] === ' ') continue;
        ctx.drawImage(glyph(str[i], col), 0, 0, cell, cell,
                      x + i * cell * scale, y, cell * scale, cell * scale);
      }
    },
    /* centred on a screen of width screenW */
    center: function (ctx, str, screenW, y, col, scale) {
      scale = scale || 1;
      this.draw(ctx, str, Math.round((screenW - String(str).length * cell * scale) / 2),
                y, col, scale);
    },
    /* centred on an arbitrary point — for floating score popups */
    at: function (ctx, str, cx, y, col, scale) {
      scale = scale || 1;
      this.draw(ctx, str, Math.round(cx - String(str).length * cell * scale / 2),
                Math.round(y), col, scale);
    },
    right: function (ctx, str, xRight, y, col, scale) {
      scale = scale || 1;
      this.draw(ctx, str, xRight - String(str).length * cell * scale, y, col, scale);
    }
  };
};

/* =========================================================================
   SPRITES — pixel grids and pre-rotated frames
   -------------------------------------------------------------------------
   Write sprites as arrays of strings, one char per pixel, '.' transparent.
   Rotation is nearest-neighbour into a fixed set of frames, the way real
   boards stored several orientations per ship — a smoothly transformed
   sprite reads as modern and wrong.
   ========================================================================= */
Arcade.Sprite = {
  build: function (rows, palette) {
    var h = rows.length, w = rows[0].length;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var ch = rows[y][x];
        if (ch === '.' || ch === ' ' || !palette[ch]) continue;
        g.fillStyle = palette[ch];
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  },

  /* A flat-colour copy — for hit flashes and morph/pulse effects. */
  tint: function (src, col) {
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = col;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  },

  flipH: function (src) {
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var g = c.getContext('2d');
    g.translate(src.width, 0); g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  },

  rotate: function (src, angle, size) {
    size = size || Math.ceil(Math.max(src.width, src.height) * 1.5);
    var out = document.createElement('canvas');
    out.width = size; out.height = size;
    var octx = out.getContext('2d');
    var sw = src.width, sh = src.height;
    var sd = src.getContext('2d').getImageData(0, 0, sw, sh).data;
    var od = octx.createImageData(size, size);
    var cx = size / 2, cy = size / 2, scx = sw / 2, scy = sh / 2;
    var cos = Math.cos(-angle), sin = Math.sin(-angle);
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var dx = x - cx + 0.5, dy = y - cy + 0.5;
        var sx = Math.floor(dx * cos - dy * sin + scx);
        var sy = Math.floor(dx * sin + dy * cos + scy);
        if (sx < 0 || sy < 0 || sx >= sw || sy >= sh) continue;
        var si = (sy * sw + sx) * 4;
        if (sd[si + 3] === 0) continue;
        var oi = (y * size + x) * 4;
        od.data[oi] = sd[si]; od.data[oi + 1] = sd[si + 1];
        od.data[oi + 2] = sd[si + 2]; od.data[oi + 3] = 255;
      }
    }
    octx.putImageData(od, 0, 0);
    return out;
  },

  /* A rotation set plus the index lookup that goes with it. */
  rotations: function (src, n, size) {
    n = n || 24;
    size = size || Math.ceil(Math.max(src.width, src.height) * 1.5);
    var frames = [];
    for (var i = 0; i < n; i++) frames.push(Arcade.Sprite.rotate(src, i * Math.PI * 2 / n, size));
    frames.count = n;
    frames.size = size;
    frames.index = function (a) {
      var i2 = Math.round(a / (Math.PI * 2 / n)) % n;
      return (i2 + n) % n;
    };
    frames.draw = function (ctx, angle, x, y) {
      ctx.drawImage(frames[frames.index(angle)],
                    Math.round(x) - size / 2, Math.round(y) - size / 2);
    };
    return frames;
  },

  /* Draw a plain sprite centred on a point. */
  draw: function (ctx, spr, x, y) {
    ctx.drawImage(spr, Math.round(x) - spr.width / 2, Math.round(y) - spr.height / 2);
  }
};

/* =========================================================================
   PATH — Catmull-Rom splines walked at constant speed
   -------------------------------------------------------------------------
   Enemy attack runs, bonus-item arcs, demo routes. Sampling by arc length
   (not by parameter) is what stops a ship accelerating through curves.
   ========================================================================= */
Arcade.Path = {
  build: function (cps, step) {
    step = step || 0.06;
    var p = [cps[0]].concat(cps, [cps[cps.length - 1]]);
    var pts = [];
    function cr(p0, p1, p2, p3, t) {
      var t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * p1) + (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    }
    for (var i = 0; i < p.length - 3; i++) {
      for (var t = 0; t < 1; t += step) {
        pts.push({
          x: cr(p[i].x, p[i+1].x, p[i+2].x, p[i+3].x, t),
          y: cr(p[i].y, p[i+1].y, p[i+2].y, p[i+3].y, t)
        });
      }
    }
    pts.push({ x: cps[cps.length-1].x, y: cps[cps.length-1].y });
    var cum = [0], L = 0;
    for (var j = 1; j < pts.length; j++) {
      L += Math.hypot(pts[j].x - pts[j-1].x, pts[j].y - pts[j-1].y);
      cum.push(L);
    }
    return { pts: pts, cum: cum, len: L };
  },

  sample: function (path, d) {
    var pts = path.pts, cum = path.cum, n = pts.length - 1;
    if (d <= 0) {
      return { x: pts[0].x, y: pts[0].y,
               a: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x), done: false };
    }
    if (d >= path.len) {
      return { x: pts[n].x, y: pts[n].y,
               a: Math.atan2(pts[n].y - pts[n-1].y, pts[n].x - pts[n-1].x), done: true };
    }
    var lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
    var seg = cum[hi] - cum[lo], f = seg > 0 ? (d - cum[lo]) / seg : 0;
    return {
      x: pts[lo].x + (pts[hi].x - pts[lo].x) * f,
      y: pts[lo].y + (pts[hi].y - pts[lo].y) * f,
      a: Math.atan2(pts[hi].y - pts[lo].y, pts[hi].x - pts[lo].x),
      done: false
    };
  },

  mirror: function (pts, screenW) {
    return pts.map(function (p) { return { x: screenW - p.x, y: p.y }; });
  }
};

/* =========================================================================
   AUDIO — synthesised, no samples
   ========================================================================= */
Arcade.Audio = function (opts) {
  opts = opts || {};
  var AC = null, gain = null, on = false, noiseBuf = null;

  function init() {
    if (AC) return AC;
    var Ctor = root.AudioContext || root.webkitAudioContext;
    if (!Ctor) return null;
    AC = new Ctor();
    gain = AC.createGain();
    gain.gain.value = opts.volume == null ? 0.22 : opts.volume;
    gain.connect(AC.destination);
    return AC;
  }

  /* One second of white noise, made once and shared. Exposed because a game
     that builds its own nodes — a speech synthesiser, a wind loop — needs
     the same buffer rather than a second copy of it. */
  function noiseBuffer() {
    if (!init()) return null;
    if (!noiseBuf) {
      noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  var api = {
    init: init,
    get enabled() { return on; },
    get context() { return AC; },
    /* The master gain every voice hangs off, so a game can add its own
       nodes and still be muted by the cabinet's sound button. */
    get bus() { return gain; },
    noiseBuffer: noiseBuffer,
    resume: function () { if (AC && AC.state === 'suspended') AC.resume(); },
    toggle: function () {
      init(); on = !on;
      if (on) api.resume();
      return on;
    },
    set: function (v) { init(); on = !!v; if (on) api.resume(); return on; },

    /* A single oscillator blip. slideTo bends the pitch across the note. */
    tone: function (freq, dur, type, vol, slideTo, delay) {
      if (!on || !AC) return;
      var t0 = AC.currentTime + (delay || 0);
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol == null ? 0.5 : vol, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(gain);
      o.start(t0); o.stop(t0 + dur + 0.02);
    },

    /* Band-passed noise — explosions, thrust, footsteps, static. */
    noise: function (dur, vol, filtFrom, filtTo, delay) {
      if (!on || !AC) return;
      var t0 = AC.currentTime + (delay || 0);
      var s = AC.createBufferSource(); s.buffer = noiseBuffer();
      var f = AC.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.setValueAtTime(filtFrom, t0);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, filtTo), t0 + dur);
      f.Q.value = 1.2;
      var g = AC.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(gain);
      s.start(t0); s.stop(t0 + dur + 0.02);
    },

    /* A melodic run: notes are [freqHz, ...] at a fixed step. */
    sequence: function (notes, step, dur, type, vol) {
      for (var i = 0; i < notes.length; i++) {
        api.tone(notes[i], dur || 0.14, type || 'square', vol == null ? 0.26 : vol,
                 null, i * (step || 0.1));
      }
    }
  };
  return api;
};

/* Equal-temperament helper so tunes can be written as note names. */
Arcade.note = (function () {
  var semis = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  return function (name) {
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(String(name).toUpperCase().replace('B-', 'Bb-'));
    if (!m) return 440;
    var n = semis[m[1]] + (m[2] === '#' ? 1 : (m[2].toLowerCase() === 'b' ? -1 : 0));
    var oct = parseInt(m[3], 10);
    return 440 * Math.pow(2, (n - 9) / 12 + (oct - 4));
  };
})();

/* =========================================================================
   INPUT — keyboard, pointer drag, and a fire button
   ========================================================================= */
Arcade.Input = function (canvas, screen) {
  var keys = {}, edge = {}, pointer = { x: null, y: null, down: false };
  var firedThisFrame = false;

  function norm(k) {
    if (k === 'ArrowLeft'  || k === 'a' || k === 'A') return 'left';
    if (k === 'ArrowRight' || k === 'd' || k === 'D') return 'right';
    if (k === 'ArrowUp'    || k === 'w' || k === 'W') return 'up';
    if (k === 'ArrowDown'  || k === 's' || k === 'S') return 'down';
    if (k === ' ' || k === 'Control' || k === 'z' || k === 'Z') return 'fire';
    if (k === 'Enter' || k === '1') return 'start';
    return k;
  }

  root.addEventListener('keydown', function (e) {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter'].indexOf(e.key) >= 0) e.preventDefault();
    var k = norm(e.key);
    if (!keys[k]) edge[k] = true;
    keys[k] = true;
  });
  root.addEventListener('keyup', function (e) { keys[norm(e.key)] = false; });
  root.addEventListener('blur', function () { keys = {}; });

  if (canvas) {
    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId);
      var p = screen.pointerPos(e);
      pointer.x = p.x; pointer.y = p.y; pointer.down = true;
      edge.tap = true;
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!pointer.down) return;
      var p = screen.pointerPos(e);
      pointer.x = p.x; pointer.y = p.y;
    });
    function release() { pointer.down = false; pointer.x = null; pointer.y = null; }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  return {
    keys: keys,
    pointer: pointer,
    held: function (k) { return !!keys[k]; },
    /* true once per press, cleared by endFrame() */
    pressed: function (k) { return !!edge[k]; },
    axis: function () { return (keys.right ? 1 : 0) - (keys.left ? 1 : 0); },
    axisY: function () { return (keys.down ? 1 : 0) - (keys.up ? 1 : 0); },
    tapFire: function () { edge.fire = true; },
    endFrame: function () { edge = {}; }
  };
};

/* =========================================================================
   LOOP — fixed timestep
   -------------------------------------------------------------------------
   Arcade games were written against a 60Hz vblank. Running update() on a
   variable delta changes the feel on every machine; step it instead.
   ========================================================================= */
Arcade.Loop = function (update, render, hz) {
  var step = 1000 / (hz || 60), acc = 0, last = 0, running = false, raf = 0;
  function frame(ts) {
    if (!running) return;
    if (!last) last = ts;
    var dt = Math.min(100, ts - last);
    last = ts;
    acc += dt;
    var guard = 0;
    while (acc >= step && guard < 5) { update(); acc -= step; guard++; }
    if (guard >= 5) acc = 0;              /* tab was backgrounded — drop the debt */
    render();
    raf = requestAnimationFrame(frame);
  }
  return {
    start: function () { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); },
    stop:  function () { running = false; cancelAnimationFrame(raf); }
  };
};

/* =========================================================================
   STARS — scrolling, blinking starfield
   ========================================================================= */
Arcade.Stars = function (screen, opts) {
  opts = opts || {};
  var cols = opts.colors || ['#ffffff','#f83800','#0058f8','#00b800','#fcd800','#3cbcfc','#f878f8'];
  var n = opts.count || 108, groups = opts.groups || 4;
  var stars = [], blinkT = 0, phase = 0;
  for (var i = 0; i < n; i++) {
    stars.push({
      x: Math.floor(Math.random() * screen.width),
      y: Math.random() * screen.height,
      spd: 0.30 + (i % 3) * 0.26,
      col: cols[(Math.random() * cols.length) | 0],
      grp: i % groups
    });
  }
  return {
    speed: 1,
    update: function () {
      if (++blinkT >= (opts.blinkRate || 14)) { blinkT = 0; phase = (phase + 1) % groups; }
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.y += s.spd * this.speed;
        if (s.y >= screen.height) { s.y -= screen.height; s.x = Math.floor(Math.random() * screen.width); }
        else if (s.y < 0) { s.y += screen.height; s.x = Math.floor(Math.random() * screen.width); }
      }
    },
    draw: function () {
      var ctx = screen.ctx;
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        if (s.grp === phase) continue;      /* one group blinks off at a time */
        ctx.fillStyle = s.col;
        ctx.fillRect(s.x, Math.floor(s.y), 1, 1);
      }
    }
  };
};

/* =========================================================================
   FX — explosions and floating score popups
   ========================================================================= */
Arcade.FX = function (screen, font) {
  var booms = [], pops = [];
  var pal = Arcade.palettes.namco;
  return {
    boom: function (x, y, big) {
      booms.push({ x: x, y: y, t: 0, big: !!big, life: big ? 40 : 26 });
    },
    popup: function (x, y, str, col) {
      pops.push({ x: x, y: y, s: String(str), t: 0, col: col || pal.cyan });
    },
    update: function () {
      var i;
      for (i = booms.length - 1; i >= 0; i--) if (++booms[i].t >= booms[i].life) booms.splice(i, 1);
      for (i = pops.length - 1; i >= 0; i--) if (++pops[i].t > 60) pops.splice(i, 1);
    },
    draw: function () {
      var ctx = screen.ctx, i, b;
      /* radial spoke burst — the shape nearly every raster board used */
      for (i = 0; i < booms.length; i++) {
        b = booms[i];
        var f = b.t / b.life;
        var spokes = b.big ? 12 : 8, maxR = b.big ? 22 : 13, r = f * maxR;
        ctx.fillStyle = f < 0.22 ? pal.white : (f < 0.5 ? pal.yellow : (f < 0.78 ? pal.orange : pal.red));
        if (f < 0.3) {
          var cr = Math.max(1, Math.round((0.3 - f) * (b.big ? 20 : 12)));
          ctx.fillRect(Math.round(b.x - cr / 2), Math.round(b.y - cr / 2), cr, cr);
        }
        for (var s = 0; s < spokes; s++) {
          var a = (s / spokes) * Math.PI * 2 + (b.big ? 0.13 : 0);
          var len = (b.big ? 5 : 3) * (1 - f * 0.55);
          for (var k = 0; k < len; k++) {
            var px = Math.round(b.x + Math.cos(a) * (r + k));
            var py = Math.round(b.y + Math.sin(a) * (r + k));
            if (px < 0 || py < 0 || px >= screen.width || py >= screen.height) continue;
            ctx.fillRect(px, py, 1, 1);
          }
        }
      }
      if (font) {
        for (i = 0; i < pops.length; i++) {
          font.at(ctx, pops[i].s, pops[i].x, pops[i].y - pops[i].t * 0.12, pops[i].col);
        }
      }
    },
    clear: function () { booms = []; pops = []; }
  };
};

/* =========================================================================
   STORE — localStorage that never throws
   ========================================================================= */
Arcade.Store = {
  get: function (key, fallback) {
    try {
      var v = root.localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set: function (key, val) {
    try { root.localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
};

/* =========================================================================
   CABINET — the bezel, CRT overlay, control strip and scaling
   -------------------------------------------------------------------------
   Every game in the arcade gets the same surround, so the collection reads
   as one machine rather than a folder of demos. Scanlines default OFF.
   ========================================================================= */
Arcade.Cabinet = function (mount, screen, opts) {
  opts = opts || {};
  if (!document.getElementById('arcade-cabinet-css')) {
    var st = document.createElement('style');
    st.id = 'arcade-cabinet-css';
    st.textContent = [
      '.ac-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;}',
      '.ac-cab{background:linear-gradient(180deg,#242432 0%,#14141c 22%,#08080d 100%);',
        'border-radius:10px;padding:14px;flex:0 0 auto;max-width:100%;',
        'box-shadow:0 0 0 1px #2e2e40,0 0 0 4px #0a0a10,0 24px 60px -18px #000,inset 0 1px 0 #3a3a52;}',
      '.ac-screen{position:relative;background:#000;border-radius:3px;overflow:hidden;line-height:0;',
        'box-shadow:inset 0 0 0 2px #000,inset 0 0 22px 8px rgba(0,0,0,.95);}',
      '.ac-screen canvas{display:block;image-rendering:pixelated;background:#000;touch-action:none;}',
      '.ac-crt{position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;',
        'background:repeating-linear-gradient(180deg,rgba(0,0,0,0) 0px,rgba(0,0,0,0) 1px,',
        'rgba(0,0,0,.34) 2px,rgba(0,0,0,.34) 3px);}',
      '.ac-crt::after{content:"";position:absolute;inset:0;',
        'background:radial-gradient(ellipse 78% 68% at 50% 50%,rgba(0,0,0,0) 48%,rgba(0,0,0,.62) 100%);}',
      '.ac-crt[hidden]{display:none!important;}',
      '.ac-rack{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;max-width:520px;}',
      '.ac-rack button{font:11px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.14em;',
        'text-transform:uppercase;color:#8d8da6;background:linear-gradient(180deg,#1d1d28,#12121a);',
        'border:1px solid #32324a;border-radius:4px;padding:7px 12px;cursor:pointer;}',
      '.ac-rack button:hover{color:#d6d6ea;border-color:#4a4a68;}',
      '.ac-rack button[aria-pressed="true"]{color:#3cbcfc;border-color:#245a78;',
        'background:linear-gradient(180deg,#14202a,#0d1620);}',
      '.ac-rack button:focus-visible{outline:2px solid #3cbcfc;outline-offset:2px;}',
      '@media (prefers-reduced-motion:reduce){.ac-crt{background-image:none;}}'
    ].join('');
    document.head.appendChild(st);
  }

  var wrap = document.createElement('div'); wrap.className = 'ac-wrap';
  var cab = document.createElement('div'); cab.className = 'ac-cab';
  var scr = document.createElement('div'); scr.className = 'ac-screen';
  var crt = document.createElement('div'); crt.className = 'ac-crt';
  crt.hidden = opts.crt !== true;                    /* scanlines off unless asked */
  scr.appendChild(screen.canvas); scr.appendChild(crt);
  cab.appendChild(scr); wrap.appendChild(cab);

  var rack = document.createElement('div'); rack.className = 'ac-rack';
  wrap.appendChild(rack);
  mount.appendChild(wrap);

  function button(label, pressed, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (pressed !== null) b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.addEventListener('click', function () { onClick(b); });
    rack.appendChild(b);
    return b;
  }

  var api = {
    wrap: wrap, rack: rack, crtEl: crt,
    button: button,
    addSoundButton: function (audio) {
      return button('Sound Off', false, function (b) {
        var on = audio.toggle();
        b.textContent = on ? 'Sound On' : 'Sound Off';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    },
    addCrtButton: function () {
      return button(crt.hidden ? 'CRT Off' : 'CRT On', !crt.hidden, function (b) {
        crt.hidden = !crt.hidden;
        b.textContent = crt.hidden ? 'CRT Off' : 'CRT On';
        b.setAttribute('aria-pressed', crt.hidden ? 'false' : 'true');
      });
    },
    /* Keeps the canvas integer-scaled as the window changes. */
    autoFit: function (reserveH) {
      reserveH = reserveH == null ? 150 : reserveH;
      function fit() {
        screen.fit(Math.max(120, root.innerWidth - 56),
                   Math.max(160, root.innerHeight - reserveH));
      }
      root.addEventListener('resize', fit);
      fit();
      return fit;
    }
  };
  return api;
};

/* =========================================================================
   MISC
   ========================================================================= */
Arcade.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
Arcade.rand  = function (a, b) { return a + Math.random() * (b - a); };
Arcade.pick  = function (arr) { return arr[(Math.random() * arr.length) | 0]; };
/* axis-aligned overlap on half-extents — the collision shape arcade
   hardware actually used */
Arcade.hit = function (ax, ay, ahw, ahh, bx, by, bhw, bhh) {
  return Math.abs(ax - bx) < (ahw + bhw) && Math.abs(ay - by) < (ahh + bhh);
};

Arcade.version = '1.0.0';

if (typeof module === 'object' && module.exports) module.exports = Arcade;
root.Arcade = Arcade;

})(typeof window !== 'undefined' ? window : globalThis);
