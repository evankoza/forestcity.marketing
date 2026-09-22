/* ==============================================================
   Hero art: a dithered blue jay, perched on the branch in the
   photograph behind it.

   The branch is a PHOTOGRAPH and is left alone — it is an <img>
   in the markup and nothing here touches it. Only the bird is
   rasterised. That split is deliberate: running a forest photo
   through a three-tone dither turns it to mud, because unlike a
   pale sky there is no large flat light area for the diffused
   error to disappear into.

   RASTERISING THE BIRD
     1. Downsample to one pixel per dither cell.
     2. Tone curve on luminance, INSIDE the silhouette only.
     3. Floyd-Steinberg error diffusion, serpentine, against the
        palette's actual luminances.
     4. Blit back up with smoothing off, so every cell is a hard
        square.

   Downsample first, dither second — dithering at full resolution
   and scaling after destroys the pattern. Error diffusion rather
   than ordered Bayer: Bayer leaves a visible regular crosshatch,
   this gives organic non-repeating speckle.

   PERCHING IS SOLVED, NOT POSITIONED
   The bird is not placed at a hand-picked pixel. PERCH is a point
   on the branch in the PHOTOGRAPH's own coordinates, and the code
   works out where object-fit:cover has put that point at this
   viewport, then stands the bird on it. So the bird keeps its
   footing at any window size, including the crops where the branch
   slides sideways underneath it.

   Which point is itself solved — the bird has two feet and the
   bark is a slope, so only certain places on the branch can hold
   both of them. See the comment on PERCH_X.
   ============================================================== */

(function () {
  'use strict';

  var cv = document.getElementById('bird');
  var photo = document.querySelector('.hero__photo');
  if (!cv || !cv.getContext || !photo) return;
  var ctx = cv.getContext('2d');

  var CELL = 5;             // css px per dither cell — the pixel size

  // The two frames are the same bird with its head turned.
  //
  // The hold is RANDOM between these two bounds rather than a fixed beat. On
  // a metronome the bird reads as a blinking GIF — the eye locks onto the
  // period within a couple of cycles and the whole thing stops looking
  // alive. Uneven holds around the same average read as a bird deciding
  // where to look. The lower bound is what stops two turns landing on top of
  // each other; the upper is where it starts to look like it has frozen.
  var HOLD_MIN = 0.7, HOLD_MAX = 3.4;
  var ORDER = [0, 1];

  // Bob: the BODY drifts over legs that do not move.
  //
  // This is what the three-way split buys. When the bird was one sprite,
  // any movement dragged the feet with it — so the drift had to shrink to
  // downward-only, and even that was half a movement. With the legs pinned
  // the body is free in both axes and the feet cannot go anywhere.
  //
  // IT MOVES ONLY ON A HEAD TURN. The body takes a new offset at the moment
  // the head changes, and then holds it dead still until the next one.
  //
  // This replaced a continuous circular drift on its own nine-second
  // period. Two slow movements running at unrelated rates read as the bird
  // sliding around under its own head; one movement that happens ON the
  // turn reads as the bird shifting its weight as it looks — a single
  // gesture instead of two.
  //
  // It is also why the holds being random matters twice over: the turn and
  // the shift now land together, so an even beat would make both obvious
  // at once.
  //
  // +/-1 cell is 5px, against a body about 200px tall and 220px wide on a
  // desktop. What bounds it is the hip overlap — the legs' tops sit ~86
  // sprite-px up inside the body, and at the widest point of the belly the
  // body overhangs the legs by far more than a cell in each direction, so
  // neither axis can pull the body clear of its own thighs at this
  // amplitude. Raise it much past 2 and it will.
  //
  // Offsets stay in whole CELLs, never fractions. A sub-cell offset puts
  // the body's pixels off the grid they were dithered on, and the speckle
  // visibly crawls against the static legs.
  var BOB_X = 1, BOB_Y = 1;

  // PERCH: where the bird's feet go, in the PHOTOGRAPH's own normalised
  // coordinates — 0,0 top left of the image file, 1,1 bottom right.
  //
  // The sprites were hand-edited to bring the right leg down — the
  // original photographs caught the jay mid-step with that foot lifted
  // about 100px clear, which no placement could put on a branch. The two
  // toes now land within 21 sprite-px of each other, so the bird can
  // simply stand somewhere.
  //
  // PERCH is where the LOWER toe goes: the lowest point of the silhouette,
  // which is what findFeet() returns. Y is a few pixels INTO the bark
  // rather than level with its edge, so the toe grips rather than grazes.
  //
  // Two things about the surface, both of which caught this out before:
  //
  //   - The bark's top edge was traced by segmenting the photograph
  //     (foliage is green-dominant, bark is not), but that mask also
  //     catches the big out-of-focus TRUNK behind the branch. Standing on
  //     blurred trunk reads as floating, because the eye takes the sharp
  //     branch as the surface. The mask is therefore intersected with a
  //     local-variance test, so only in-focus bark counts.
  //   - A smoothed edge curve lies near discontinuities. An earlier perch
  //     was placed on a 21px-smoothed trace that blended across the gap
  //     between trunk and limb, and put the foot 7px above real bark.
  //     The mask is now read per column instead.
  //
  // Here: the in-focus bark at x=440 starts at y=414 and the toe is at
  // 433, so the toes close over the edge rather than resting level with
  // it. 433 was picked by rendering the composite at several depths — at
  // 417 the far foot still floated slightly, and by 440 the front toes
  // start disappearing behind the crest instead of gripping it.
  var PERCH_X = 0.2632, PERCH_Y = 0.4600;

  // The bird's width as a share of the photo's DISPLAYED width — not of the
  // viewport. That is the whole trick: cover magnifies the branch and the
  // bird by the same factor, so the bird stays the same size relative to the
  // limb it is standing on at every viewport. Tie it to the viewport instead
  // and it grows off its own feet on a narrow window.
  //
  // 0.15 puts the bird at roughly 220px wide at a 1440 viewport. Bigger than
  // life against a limb that heavy, deliberately — it is the brand mark of
  // the page, not a wildlife photograph, and at life size it read as a
  // detail rather than the subject.
  var BIRD_W = 0.15;

  // Tone curve. The source is a photograph, so its blacks and whites are
  // where the camera put them, not at 0 and 1: SRC_BLACK/SRC_WHITE are the
  // ends of the bird's actual range and everything between them is stretched
  // across the inks.
  //
  // GAMMA decides how the bird's mass is distributed across them. It was 1.4
  // when there were only two inks and the curve was doing the work the
  // palette could not — pushing enough weight into the dark ink to keep the
  // crest and the bridle from dissolving into the chest. Four inks do that
  // on their own, so this is back to a straight 1.0 and the curve is no
  // longer compensating for anything.
  var SRC_BLACK = 0.10, SRC_WHITE = 0.88, GAMMA = 1.0;

  // How much of the quantisation error is passed on to the neighbouring
  // cells. 1.0 is textbook Floyd-Steinberg.
  //
  // Held back to 0.75 on purpose. Full diffusion spends every scrap of error
  // on speckle, and with four inks — which are close enough together that
  // the error per cell is small to begin with — that speckle is the loudest
  // thing left in the sprite. Dropping it lets flat areas like the chest and
  // the cheek stay flat and leaves the dithering to the transitions, where
  // it is doing something. Lower still and it bands.
  var DIFFUSION = 0.75;

  // How bright an inked cell may get, between the lightest ink and paper. At
  // 0 the palest feathers land on solid white ink and no paper shows through
  // the bird at all. Lift it and the chest opens into holes — which on a
  // dark canopy reads as damage rather than as texture.
  var INK_CEIL_MIX = 0;

  // The palette. PAPER is never painted — it is the hole the photograph
  // shows through — so the bird is four inks and a silhouette.
  //
  // Two blues, a white and a black, spread deliberately unevenly: the jay is
  // mostly pale chest and mid-blue wing, so those two get the middle of the
  // range and BLACK is reserved for the bridle, the eye and the barring,
  // which are a small share of the bird but the whole of its face.
  //
  // WHITE and PALE are what hold the bird OFF the canopy behind it. A real
  // jay against dark foliage is the bright object in the frame, and an
  // earlier two-ink version inked in the bird's true deep blue lost the
  // entire topside into the photo. BLACK is safe to include now only because
  // there is enough light ink around it to carry the silhouette.
  var PAPER = [255, 255, 255];
  var WHITE = [242, 246, 250];   // #F2F6FA  chest, cheek, wing bar
  var PALE  = [169, 201, 233];   // #A9C9E9  the light blue
  var BLUE  = [ 74, 127, 190];   // #4A7FBE  crest, back, wing, tail
  var BLACK = [ 22,  32,  43];   // #16202B  bridle, eye, barring
  var PAL   = [PAPER, WHITE, PALE, BLUE, BLACK];
  var PAL_LUM = PAL.map(function (p) {
    return (p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114) / 255;
  });
  // The dither cannot render darker than its darkest ink. Feeding it values
  // below this makes those cells emit an error that can never be absorbed,
  // which floods outward and drags the whole sprite dark.
  var LUM_MIN = Math.min.apply(null, PAL_LUM);
  // the lightest ink that is actually painted — PAL_LUM[0] is paper
  var INK_TOP  = Math.max.apply(null, PAL_LUM.slice(1));
  var INK_CEIL = INK_TOP + INK_CEIL_MIX * (1 - INK_TOP);

  // THREE sprites, all drawn on the same 305x313 canvas so they are
  // registered by construction: the legs on their own, and two legless
  // bodies with the head turned each way.
  //
  // That split is the whole reason the bird can move at all. The legs are
  // painted once and never move, so the feet cannot leave the bark; the
  // body is a separate layer that bobs over them. Before the split, the
  // only safe movement was downward, because translating one sprite moved
  // the feet along with it.
  var SRC_LEGS = 'assets/img/jay legs.png';
  var SRC_BODY = ['assets/img/jay leggless left.png',
                  'assets/img/jay leggless right.png'];

  var legsImg = null, bodyImgs = [];
  var legsCrop = null, bodyCrops = [];
  var legsFrame = null, frames = [], order = [0];
  var W = 0, H = 0, cols = 0, rows = 0;
  var visible = true, shown = -1, shownOx = 1e9, shownOy = 1e9;
  var startedAt = 0, ready = false;
  var step = 0, nextTurn = 0;      // which way it is looking, and until when
  var bobX = 0, bobY = 0;          // where the body is sitting this glance

  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- dither a luminance grid onto a canvas ---------------- */

  function ditherToCanvas(buf) {
    var idx = new Uint8Array(cols * rows);
    var r, c, k, i, fwd, cn, b;
    for (r = 0; r < rows; r++) {
      var l2r = (r & 1) === 0;
      for (k = 0; k < cols; k++) {
        c = l2r ? k : cols - 1 - k;
        i = r * cols + c;
        var v = buf[i];
        var best = 0, bd = Infinity;
        for (var q = 0; q < PAL.length; q++) {
          var dd = v - PAL_LUM[q]; if (dd < 0) dd = -dd;
          if (dd < bd) { bd = dd; best = q; }
        }
        idx[i] = best;
        var err = (v - PAL_LUM[best]) * DIFFUSION;
        fwd = l2r ? 1 : -1; cn = c + fwd;
        if (cn >= 0 && cn < cols) buf[i + fwd] += err * 0.4375;
        if (r + 1 < rows) {
          b = i + cols;
          if (c - fwd >= 0 && c - fwd < cols) buf[b - fwd] += err * 0.1875;
          buf[b] += err * 0.3125;
          if (cn >= 0 && cn < cols) buf[b + fwd] += err * 0.0625;
        }
      }
    }
    var out = document.createElement('canvas');
    out.width = cols; out.height = rows;
    var octx = out.getContext('2d');
    var im = octx.createImageData(cols, rows), od = im.data;
    for (i = 0; i < cols * rows; i++) {
      var lvl = idx[i];
      if (lvl === 0) { od[i * 4 + 3] = 0; continue; }   // paper -> transparent
      var col = PAL[lvl];
      od[i * 4] = col[0]; od[i * 4 + 1] = col[1];
      od[i * 4 + 2] = col[2]; od[i * 4 + 3] = 255;
    }
    octx.putImageData(im, 0, 0);
    return out;
  }

  // Luminance -> the value the dither sees, for a cell that is INSIDE the
  // bird. Outside, the caller uses paper instead; the two are mixed by alpha
  // so the edge feathers rather than staircases.
  function tone(Y) {
    var t = (Y - SRC_BLACK) / (SRC_WHITE - SRC_BLACK);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return LUM_MIN + Math.pow(t, GAMMA) * (INK_CEIL - LUM_MIN);
  }

  /* ---- where cover has put the perch ------------------------ */

  // object-position lives in the stylesheet and is read back rather than
  // duplicated here, so the two cannot drift apart.
  function objectPosition() {
    var v = window.getComputedStyle(photo).objectPosition || '50% 50%';
    var parts = v.split(/\s+/);
    var box = photo.getBoundingClientRect();
    var axis = function (token, extent) {
      if (!token) return 0.5;
      if (token.slice(-1) === '%') return parseFloat(token) / 100;
      // A px object-position is an offset, not a fraction. It is only
      // meaningful against the overflow, which is what the caller multiplies
      // by, so convert it back to the fraction that produces the same offset.
      var px = parseFloat(token);
      return isNaN(px) || !extent ? 0.5 : px / extent;
    };
    return { x: axis(parts[0], box.width), y: axis(parts[1] || parts[0], box.height) };
  }

  // The perch in canvas pixels, plus the displayed photo width, or null
  // before the photo has decoded (naturalWidth is 0 until then).
  function perch() {
    var nw = photo.naturalWidth, nh = photo.naturalHeight;
    if (!nw || !nh || !W || !H) return null;
    var scale = Math.max(W / nw, H / nh);        // object-fit: cover
    var dw = nw * scale, dh = nh * scale;
    var op = objectPosition();
    return {
      x: (W - dw) * op.x + PERCH_X * dw,
      y: (H - dh) * op.y + PERCH_Y * dh,
      dw: dw
    };
  }

  /* ---- the sprite ------------------------------------------- */

  // The frames arrive from prep-bird.py already cut out and already cropped
  // to one shared box, so there is nothing to find here: alpha IS the
  // silhouette, and the two frames are registered by construction.
  function read(img) {
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    // Reading pixels back out of a canvas that has had an image drawn into
    // it needs that image to be same-origin. Over file:// browsers treat
    // every local file as a separate origin, so this throws and the bird
    // cannot be built. That is a serving problem, not a page problem —
    // caught here so the hero degrades to the photograph on its own instead
    // of dying inside an onload handler and leaving a blank canvas.
    var px;
    try {
      px = g.getImageData(0, 0, c.width, c.height).data;
    } catch (e) {
      if (window.console && console.warn) {
        console.warn('bird.js: cannot read the sprite pixels (' + e.name +
                     '). Serve the folder over http:// rather than opening ' +
                     'index.html from disk. The hero photo is unaffected.');
      }
      return null;
    }
    var n = c.width * c.height;
    var lum = new Float32Array(n), alpha = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      lum[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 +
                px[i * 4 + 2] * 0.114) / 255;
      alpha[i] = px[i * 4 + 3] / 255;
    }
    return { w: c.width, h: c.height, lum: lum, alpha: alpha };
  }

  // The feet are the bottom of the silhouette. Deriving the anchor rather
  // than hard-coding it means replacement art only has to be a cut-out of a
  // bird standing on its feet — there is no measurement to hand over with it.
  function findFeet(fr) {
    var x, y, i, lowest = -1;
    for (y = fr.h - 1; y >= 0 && lowest < 0; y--)
      for (x = 0; x < fr.w; x++)
        if (fr.alpha[y * fr.w + x] > 0.5) { lowest = y; break; }
    if (lowest < 0) return { x: fr.w / 2, y: fr.h };
    // Mean x across the lowest few rows: one row can be a single toe, and
    // hanging the whole bird off a toe leans it.
    var band = Math.max(1, Math.round(fr.h * 0.02));
    var sum = 0, count = 0;
    for (y = Math.max(0, lowest - band); y <= lowest; y++)
      for (x = 0; x < fr.w; x++) {
        i = y * fr.w + x;
        if (fr.alpha[i] > 0.5) { sum += x; count++; }
      }
    return { x: count ? sum / count : fr.w / 2, y: lowest };
  }

  function loadFrames() {
    legsCrop = legsImg ? read(legsImg) : null;
    bodyCrops = bodyImgs.filter(Boolean).map(read).filter(Boolean);
    if (!legsCrop) return;
    // The anchor comes from the LEGS, because they are the only sprite with
    // a foot in them. All three share the 305x313 canvas, so the single
    // origin derived from this places every layer in register.
    var f = findFeet(legsCrop);
    legsCrop.ax = f.x; legsCrop.ay = f.y;
  }

  function sample(fr, arr, sx, sy) {
    if (sx < 0 || sy < 0 || sx >= fr.w - 1 || sy >= fr.h - 1) return 0;
    var xi = sx | 0, yi = sy | 0, fx = sx - xi, fy = sy - yi;
    var i = yi * fr.w + xi;
    var a = arr[i], b = arr[i + 1];
    var c = arr[i + fr.w], d = arr[i + fr.w + 1];
    var t1 = a + (b - a) * fx, t2 = c + (d - c) * fx;
    return t1 + (t2 - t1) * fy;
  }

  // x0/y0 is the sprite canvas's origin. It is passed in rather than
  // derived per sprite, so the legs and both bodies land on exactly the
  // same grid — that shared grid is what keeps them registered.
  function build(fr, x0, y0, bw) {
    var scale = bw / fr.w;
    var bh = fr.h * scale;

    var buf = new Float32Array(cols * rows);
    for (var i = 0; i < buf.length; i++) buf[i] = 1;
    var c0 = Math.max(0, Math.floor(x0 / CELL));
    var c1 = Math.min(cols - 1, Math.ceil((x0 + bw) / CELL));
    var r0 = Math.max(0, Math.floor(y0 / CELL));
    var r1 = Math.min(rows - 1, Math.ceil((y0 + bh) / CELL));
    for (var r = r0; r <= r1; r++) {
      var y = r * CELL + CELL * 0.5;
      for (var c = c0; c <= c1; c++) {
        var x = c * CELL + CELL * 0.5;
        var sx = (x - x0) / scale, sy = (y - y0) / scale;
        var a = sample(fr, fr.alpha, sx, sy);
        if (a <= 0.004) continue;                  // outside the bird
        if (a > 1) a = 1;
        var inked = tone(sample(fr, fr.lum, sx, sy));
        buf[r * cols + c] = a * inked + (1 - a) * 1;   // feather into paper
      }
    }
    return ditherToCanvas(buf);
  }

  /* ---- assembly --------------------------------------------- */

  // Legs first, body over them. A bird's thighs sit under its belly
  // feathers, and drawing the body on top is what hides the join as it
  // rides up and down.
  function blit(idx, ox, oy) {
    if (!frames.length || !legsFrame) return;
    if (idx === shown && ox === shownOx && oy === shownOy) return;
    shown = idx; shownOx = ox; shownOy = oy;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    // legs at a literal 0,0 — this is what pins the feet to the bark, and
    // it is the reason the body above is free to move at all
    ctx.drawImage(legsFrame, 0, 0, cols, rows, 0, 0, cols * CELL, rows * CELL);
    ctx.drawImage(frames[idx], 0, 0, cols, rows,
                  ox * CELL, oy * CELL, cols * CELL, rows * CELL);
  }

  function rebuild() {
    if (!W || !H || !cols || !legsCrop) return;
    var p = perch();
    if (!p) return;                 // photo not decoded yet; load() retries

    var bw = BIRD_W * p.dw;
    var scale = bw / legsCrop.w;
    // Stand the legs' lowest toe on the perch, then snap that origin to the
    // cell grid — the grid is what the speckle was diffused on, and half a
    // cell of offset makes the bird shimmer on resize.
    var x0 = Math.round((p.x - legsCrop.ax * scale) / CELL) * CELL;
    var y0 = Math.round((p.y - legsCrop.ay * scale) / CELL) * CELL;

    legsFrame = build(legsCrop, x0, y0, bw);
    frames = bodyCrops.map(function (fr) { return build(fr, x0, y0, bw); });
    order = ORDER.filter(function (i) { return i < frames.length; });
    if (!order.length) order = [0];
    shown = -1; shownOx = 1e9; shownOy = 1e9;
    blit(order[0], 0, 0);
    ready = true;
  }

  function resize() {
    var rect = cv.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    if (w === W && h === H) return;
    W = w; H = h;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    cols = Math.ceil(W / CELL) + 1;
    rows = Math.ceil(H / CELL) + 1;
    rebuild();
  }

  function hold() {
    return HOLD_MIN + Math.random() * (HOLD_MAX - HOLD_MIN);
  }

  // A new resting offset for the body, guaranteed to differ from the one it
  // is on. Without that check a third of the turns would draw the same
  // position again and the bird would appear to turn its head without
  // moving — which reads as a dropped frame rather than as stillness.
  function shift() {
    var x, y, tries = 0;
    do {
      x = (Math.floor(Math.random() * 3) - 1) * BOB_X;
      y = (Math.floor(Math.random() * 3) - 1) * BOB_Y;
    } while (x === bobX && y === bobY && ++tries < 12);
    bobX = x; bobY = y;
  }

  function tick(now) {
    window.requestAnimationFrame(tick);
    if (!visible || !ready) return;
    if (!startedAt) { startedAt = now; step = 0; nextTurn = hold(); }
    var secs = (now - startedAt) / 1000;
    // Turn when this glance has run out, and draw the next hold then — so
    // every hold is its own length rather than the sequence repeating.
    // The body shifts on the same tick, so the two are one gesture.
    if (secs >= nextTurn) {
      step = (step + 1) % order.length;
      nextTurn = secs + hold();
      shift();
    }
    blit(order[step], bobX, bobY);
  }

  function load() {
    var pending = 1 + SRC_BODY.length, got = 0;
    var done = function () {
      if (++got < pending) return;
      loadFrames();
      resize();
      rebuild();
      if (!reduced) { startedAt = 0; window.requestAnimationFrame(tick); }
    };
    var li = new Image();
    li.onload = function () { legsImg = li; done(); };
    li.onerror = done;
    li.src = SRC_LEGS;
    SRC_BODY.forEach(function (src, i) {
      var im = new Image();
      im.onload = function () { bodyImgs[i] = im; done(); };
      im.onerror = done;
      im.src = src;
    });
  }

  // The perch is derived from the photo's intrinsic size, so the bird cannot
  // be placed until the photo has decoded. It is usually the slower of the
  // two, but a cached hit can land before this script runs — hence both the
  // listener and the complete check.
  if (photo.complete) rebuild();
  photo.addEventListener('load', function () { resize(); rebuild(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) {
      visible = e[0].isIntersecting;
    }, { threshold: 0 }).observe(cv);
  }
  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden;
  });
  if ('ResizeObserver' in window) {
    new ResizeObserver(function () { resize(); }).observe(cv);
  } else {
    window.addEventListener('resize', resize);
  }

  resize();
  load();
})();
