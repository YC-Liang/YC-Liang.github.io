/* =========================================================
   yc-liang.github.io: small, dependency-free interactions
   ========================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme toggle ---------- */
  var themeBtn = document.getElementById('theme-toggle');
  function currentTheme() {
    var set = root.getAttribute('data-theme');
    if (set) return set;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function setThemeLabel() {
    themeBtn.setAttribute('aria-label', currentTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
  if (themeBtn) {
    setThemeLabel();
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      setThemeLabel();
      if (window.__pfRefreshColors) window.__pfRefreshColors();
    });
  }

  /* ---------- Mobile menu ---------- */
  var menuBtn = document.getElementById('menu-toggle');
  var links = document.getElementById('nav-links');
  function closeMenu() {
    links.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Open menu');
  }
  if (menuBtn && links) {
    menuBtn.addEventListener('click', function () {
      var open = links.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    links.addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    document.addEventListener('click', function (e) {
      if (!links.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
    });
  }

  /* ---------- Nav border + active section ---------- */
  var nav = document.querySelector('.nav');
  function onScroll() { nav.classList.toggle('is-scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__links a[href^="#"]'));
  if ('IntersectionObserver' in window) {
    var sectionObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        navLinks.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['about', 'research', 'publications', 'experience', 'education', 'toolbox', 'beyond', 'contact'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) sectionObs.observe(el);
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    reveals.forEach(function (el, i) {
      // light stagger for siblings
      el.style.transitionDelay = Math.min((i % 4) * 60, 180) + 'ms';
      revealObs.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- Toast + clipboard ---------- */
  var toast = document.getElementById('toast');
  var toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-visible'); }, 2200);
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }
  document.addEventListener('click', function (e) {
    var citeBtn = e.target.closest('[data-cite]');
    if (citeBtn) {
      copyText(citeBtn.getAttribute('data-cite'))
        .then(function () { showToast('Citation copied to clipboard ✓'); })
        .catch(function () { showToast('Couldn’t copy. Please select the text manually.'); });
      return;
    }
    var copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      copyText(copyBtn.getAttribute('data-copy'))
        .then(function () { showToast('Email copied. Talk soon!'); })
        .catch(function () { showToast('Couldn’t copy. Please select the text manually.'); });
    }
  });

  /* ---------- Publication filter ---------- */
  var chips = document.querySelectorAll('.chip[data-filter]');
  var pubs = document.querySelectorAll('.pub');
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var f = chip.getAttribute('data-filter');
      chips.forEach(function (c) {
        var on = c === chip;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-pressed', String(on));
      });
      pubs.forEach(function (p) {
        var show = f === 'all' || p.getAttribute('data-topic') === f;
        p.classList.toggle('is-hidden', !show);
        if (show) p.classList.add('is-in');
      });
    });
  });

  /* =========================================================
     Hero: a particle filter tracking the visitor's cursor.
     predict → weight by a noisy observation → resample.
     Click to "kidnap the robot" (scatter the belief).
     ========================================================= */
  var canvas = document.getElementById('belief-canvas');
  var hero = document.getElementById('hero');
  var status = document.getElementById('pf-status');
  if (!canvas || !hero || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var N = 220;
  var W = 0, H = 0, DPR = 1;
  var px = new Float32Array(N), py = new Float32Array(N);
  var vx = new Float32Array(N), vy = new Float32Array(N);
  var w = new Float32Array(N);
  var nx = new Float32Array(N), ny = new Float32Array(N), nvx = new Float32Array(N), nvy = new Float32Array(N);
  var trail = [];
  var target = { x: 0, y: 0 };
  var obs = { x: 0, y: 0 };
  var lastPointer = -1e9;
  var t0 = performance.now();
  var colors = {};
  var running = false, visible = true, rafId = 0, frame = 0;
  var kidnapUntil = 0;

  function readColors() {
    var cs = getComputedStyle(root);
    colors.orange = cs.getPropertyValue('--orange').trim() || '#FF5B2E';
    colors.teal = cs.getPropertyValue('--teal').trim() || '#0F766E';
    colors.ink = cs.getPropertyValue('--ink').trim() || '#141A2E';
    colors.muted = cs.getPropertyValue('--muted').trim() || '#6C7186';
  }
  window.__pfRefreshColors = function () { readColors(); if (!running) draw(); };

  function randn() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function resize() {
    var r = hero.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    var oldW = W, oldH = H;
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!oldW) scatter();
    else if (oldW !== W || oldH !== H) {
      for (var i = 0; i < N; i++) { px[i] *= W / oldW; py[i] *= H / oldH; }
    }
  }

  function scatter() {
    for (var i = 0; i < N; i++) {
      px[i] = Math.random() * W; py[i] = Math.random() * H;
      vx[i] = randn() * 1.5; vy[i] = randn() * 1.5;
      w[i] = 1 / N;
    }
    trail.length = 0;
  }

  // Autonomous target when the visitor is idle: a lazy Lissajous loop.
  function idleTarget(t) {
    var s = t / 1000;
    var cx = W * (W > 860 ? 0.62 : 0.5), cy = H * 0.5;
    return {
      x: cx + Math.sin(s * 0.45) * W * 0.28,
      y: cy + Math.sin(s * 0.9 + 1.3) * H * 0.3
    };
  }

  function step(now) {
    if (now - lastPointer > 2500) {
      var it = idleTarget(now - t0);
      target.x += (it.x - target.x) * 0.05;
      target.y += (it.y - target.y) * 0.05;
    }

    // Noisy observation of the true state
    var sigObs = 18;
    obs.x = target.x + randn() * sigObs;
    obs.y = target.y + randn() * sigObs;

    // Predict (constant-velocity motion model + process noise) and weight
    var sigL = 70, inv2s2 = 1 / (2 * sigL * sigL), sum = 0, dmin = Infinity;
    for (var i = 0; i < N; i++) {
      vx[i] = vx[i] * 0.92 + randn() * 1.1;
      vy[i] = vy[i] * 0.92 + randn() * 1.1;
      px[i] += vx[i]; py[i] += vy[i];
      var dx = px[i] - obs.x, dy = py[i] - obs.y;
      nx[i] = dx * dx + dy * dy; // reuse buffer for squared distances
      if (nx[i] < dmin) dmin = nx[i];
    }
    // Likelihood relative to the best particle keeps weights from underflowing
    for (i = 0; i < N; i++) {
      w[i] *= Math.exp(-(nx[i] - dmin) * inv2s2) + 1e-12;
      sum += w[i];
    }
    var lost = dmin > 4 * sigL * sigL; // nobody near the observation
    var ess = 0;
    for (i = 0; i < N; i++) { w[i] /= sum; ess += w[i] * w[i]; }
    ess = 1 / ess;

    // Systematic resampling when the effective sample size collapses
    if ((ess < N * 0.5 || lost) && now > kidnapUntil - 900) {
      // Sensor-resetting: inject a few particles at the observation,
      // more of them when the belief has clearly lost track.
      var inject = Math.round(N * (lost ? 0.25 : 0.03));
      var u = Math.random() / N, c = w[0], j = 0;
      for (i = 0; i < N; i++) {
        var U = u + i / N;
        while (U > c && j < N - 1) { j++; c += w[j]; }
        if (i < inject) {
          nx[i] = obs.x + randn() * 30; ny[i] = obs.y + randn() * 30;
          nvx[i] = randn(); nvy[i] = randn();
        } else {
          nx[i] = px[j] + randn() * 3; ny[i] = py[j] + randn() * 3;
          nvx[i] = vx[j] + randn() * 0.6; nvy[i] = vy[j] + randn() * 0.6;
        }
      }
      px.set(nx); py.set(ny); vx.set(nvx); vy.set(nvy);
      for (i = 0; i < N; i++) w[i] = 1 / N;
    }

    // Estimate (weighted mean + covariance)
    var mx = 0, my = 0;
    for (i = 0; i < N; i++) { mx += w[i] * px[i]; my += w[i] * py[i]; }
    var sxx = 0, syy = 0, sxy = 0;
    for (i = 0; i < N; i++) {
      var ex = px[i] - mx, ey = py[i] - my;
      sxx += w[i] * ex * ex; syy += w[i] * ey * ey; sxy += w[i] * ex * ey;
    }
    trail.push(mx, my);
    if (trail.length > 120) trail.splice(0, 2);

    if (status && frame % 15 === 0) {
      var err = Math.hypot(mx - target.x, my - target.y);
      status.textContent = now < kidnapUntil
        ? 'kidnapped! re-localising…'
        : 'N=' + N + ' · ESS=' + Math.round(ess) + ' · error ≈ ' + Math.round(err) + 'px';
    }
    return { mx: mx, my: my, sxx: sxx, syy: syy, sxy: sxy };
  }

  var est = null;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    // Particles
    ctx.fillStyle = colors.orange;
    var wmax = 0;
    for (var i = 0; i < N; i++) if (w[i] > wmax) wmax = w[i];
    for (i = 0; i < N; i++) {
      var a = 0.18 + 0.5 * (wmax > 0 ? w[i] / wmax : 0);
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(px[i], py[i], 2 + 1.6 * (wmax > 0 ? w[i] / wmax : 0), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!est) return;

    // Trail of the estimate
    if (trail.length > 4) {
      ctx.strokeStyle = colors.teal;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(trail[0], trail[1]);
      for (var k = 2; k < trail.length; k += 2) ctx.lineTo(trail[k], trail[k + 1]);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 2σ covariance ellipse
    var tr = est.sxx + est.syy, det = est.sxx * est.syy - est.sxy * est.sxy;
    var disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    var l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
    var ang = Math.atan2(l1 - est.sxx, est.sxy || 1e-9);
    ctx.save();
    ctx.translate(est.mx, est.my);
    ctx.rotate(ang);
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = colors.teal;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.min(2 * Math.sqrt(l1), W), Math.min(2 * Math.sqrt(l2), H), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);

    // Estimate crosshair
    ctx.strokeStyle = colors.teal;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(est.mx, est.my, 6, 0, Math.PI * 2);
    ctx.moveTo(est.mx - 12, est.my); ctx.lineTo(est.mx - 8, est.my);
    ctx.moveTo(est.mx + 8, est.my); ctx.lineTo(est.mx + 12, est.my);
    ctx.moveTo(est.mx, est.my - 12); ctx.lineTo(est.mx, est.my - 8);
    ctx.moveTo(est.mx, est.my + 8); ctx.lineTo(est.mx, est.my + 12);
    ctx.stroke();

    // Latest noisy observation
    ctx.strokeStyle = colors.muted;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(obs.x - 4, obs.y - 4); ctx.lineTo(obs.x + 4, obs.y + 4);
    ctx.moveTo(obs.x + 4, obs.y - 4); ctx.lineTo(obs.x - 4, obs.y + 4);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    frame++;
    est = step(now);
    draw();
    rafId = requestAnimationFrame(loop);
  }
  function start() {
    if (running || reduceMotion || !visible || document.hidden) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  hero.addEventListener('pointermove', function (e) {
    var r = hero.getBoundingClientRect();
    target.x = e.clientX - r.left;
    target.y = e.clientY - r.top;
    lastPointer = performance.now();
  });
  hero.addEventListener('click', function (e) {
    if (e.target.closest('a, button')) return;
    scatter();
    kidnapUntil = performance.now() + 1600;
    if (reduceMotion) { est = step(performance.now()); draw(); }
  });

  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      visible ? start() : stop();
    }).observe(hero);
  }
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { resize(); if (!running) draw(); }, 120);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', window.__pfRefreshColors);

  readColors();
  resize();
  var it0 = idleTarget(0);
  target.x = it0.x; target.y = it0.y;

  if (reduceMotion) {
    // Converge offline and show a single still frame.
    for (var s = 0; s < 80; s++) est = step(t0 + s * 16);
    draw();
    if (status) status.textContent = 'reduced motion: showing a single belief snapshot';
  } else {
    start();
  }
})();
