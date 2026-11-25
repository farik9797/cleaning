(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Icons (Lucide, from the CDN) */
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.6 } });

  /* Mobile menu */
  const toggle = document.querySelector('[data-nav-toggle]');
  const menu = document.querySelector('[data-nav-menu]');
  if (toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
      toggle.querySelector('.visually-hidden').textContent = open ? 'Close menu' : 'Open menu';
    };
    toggle.addEventListener('click', () => setOpen(menu.hidden));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); toggle.focus(); } });
  }

  /* One reveal, once */
  const revealIO = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
  }), { rootMargin: '0px 0px -12% 0px' });
  document.querySelectorAll('[data-reveal]').forEach((el) => revealIO.observe(el));

  /* Current section in the nav */
  const links = [...document.querySelectorAll('.nav__links a')];
  const sectionIO = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    links.forEach((a) => {
      if (a.getAttribute('href') === '#' + e.target.id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }), { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((a) => { const s = document.querySelector(a.getAttribute('href')); if (s) sectionIO.observe(s); });

  /* Before / after */
  const compare = document.querySelector('[data-compare]');
  const range = document.querySelector('[data-compare-range]');
  if (compare && range) {
    const set = () => compare.style.setProperty('--split', range.value + '%');
    range.addEventListener('input', set);
    set();
  }

  /* A service card preselects the form */
  const select = document.querySelector('[data-service-select]');
  document.querySelectorAll('[data-service]').forEach((card) => card.addEventListener('click', () => {
    if (select) select.value = card.dataset.service;
  }));

  /* Quote form: not connected yet, says so */
  const form = document.querySelector('[data-quote-form]');
  if (form) {
    const help = form.querySelector('#quote-help');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fields = [...form.querySelectorAll('input[required]')];
      fields.forEach((f) => f.toggleAttribute('aria-invalid', !f.checkValidity()));
      const bad = fields.find((f) => !f.checkValidity());
      if (bad) {
        help.dataset.state = 'error';
        help.textContent = bad.name === 'phone' ? 'Add a phone number so we can reply with the quote.' : 'Add your name so we know who to reply to.';
        bad.setAttribute('aria-describedby', help.id);
        bad.focus();
        return;
      }
      help.dataset.state = '';
      if (!form.dataset.endpoint) { help.textContent = 'Nothing was sent: this form is not connected yet.'; return; }
      fetch(form.dataset.endpoint, { method: 'POST', body: new FormData(form) })
        .then((r) => { help.textContent = r.ok ? 'Thanks. We will call you back with a quote.' : 'That did not go through. Try again in a minute.'; })
        .catch(() => { help.textContent = 'That did not go through. Try again in a minute.'; });
    });
  }

  /* ---------- Motion (GSAP + Lenis); the page above works without it ---------- */
  const hero = document.querySelector('[data-hero]');
  const canvas = hero && hero.querySelector('[data-hero-canvas]');
  if (!hero || !canvas || reduce || !window.gsap || !window.ScrollTrigger) {
    root.classList.add('no-scrub');
    return;
  }

  const split = !!window.SplitText;
  gsap.registerPlugin(ScrollTrigger, ...(split ? [SplitText] : []));
  root.classList.add('is-scrub');

  /* Smooth scroll: Lenis drives the page, ScrollTrigger listens to it */
  let lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('a[href^="#"]:not(.skip)').forEach((a) => a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const target = id === '#top' ? 0 : document.querySelector(id);
      if (target === null) return;
      e.preventDefault();
      lenis.scrollTo(target, { duration: 1.4 });
    }));
  }

  /* Hero frames: 190 stills drawn on a canvas, neighbours cross-faded so the scrub never steps */
  const COUNT = 190;
  const portrait = matchMedia('(max-aspect-ratio: 1/1)').matches;
  const set = portrait
    ? { dir: 'assets/media/hero-sm/', from: 1, to: 0.06 }
    : { dir: 'assets/media/hero-lg/', from: 0.62, to: 0.62 };
  const ctx = canvas.getContext('2d');
  const frames = new Array(COUNT);
  let dirty = true;

  const loadFrame = (i) => new Promise((done) => {
    const im = new Image();
    im.src = set.dir + String(i + 1).padStart(3, '0') + '.webp';
    im.decode().then(() => { frames[i] = im; dirty = true; }).catch(() => {}).finally(done);
  });
  // Coarse first, fine later: the scrub works early and sharpens as frames arrive.
  const order = [];
  const queued = new Set();
  for (const step of [32, 8, 4, 2, 1]) for (let i = 0; i < COUNT; i += step) if (!queued.has(i)) { queued.add(i); order.push(i); }
  if (!queued.has(COUNT - 1)) order.splice(1, 0, COUNT - 1);
  let cursor = 1;
  const worker = async () => { while (cursor < order.length) await loadFrame(order[cursor++]); };
  loadFrame(0).then(() => { for (let w = 0; w < 6; w++) worker(); });

  const nearest = (i) => {
    for (let d = 0; d < COUNT; d++) {
      if (frames[i - d]) return i - d;
      if (frames[i + d]) return i + d;
    }
    return -1;
  };
  let pos = 0, focus = set.from, drawnPos = -1, drawnFocus = -1;
  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; ctx.imageSmoothingQuality = 'high'; dirty = true; }
  };
  const paint = (im, alpha) => {
    const cw = canvas.width, ch = canvas.height;
    const s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight);
    const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, (cw - dw) * focus, (ch - dh) / 2, dw, dh);
  };
  const render = () => {
    if (!dirty && pos === drawnPos && focus === drawnFocus) return;
    const a = Math.floor(pos), f = pos - a;
    const base = frames[a] ? a : nearest(a);
    if (base < 0) return;
    paint(frames[base], 1);
    if (base === a && f > 0.01 && frames[a + 1]) paint(frames[a + 1], f);
    ctx.globalAlpha = 1;
    drawnPos = pos; drawnFocus = focus; dirty = false;
  };
  fit();
  window.addEventListener('resize', fit);
  gsap.ticker.add(render);

  /* Hero scroll timeline */
  const copy = hero.querySelector('[data-hero-copy]');
  const outro = hero.querySelector('[data-hero-outro]');
  const cue = hero.querySelector('[data-hero-cue]');
  const wash = hero.querySelector('.hero__wash');
  const outroParts = split ? SplitText.create(outro, { type: 'words', wordsClass: 'split-word' }).words : [outro];
  gsap.set(outro, { opacity: 1 });
  const clamp01 = gsap.utils.clamp(0, 1);
  const state = { p: 0 };

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom bottom', scrub: 0.4 },
    onUpdate: () => { focus = set.from + (set.to - set.from) * clamp01((tl.progress() - 0.3) / 0.5); }
  });
  tl.to(cue, { autoAlpha: 0, y: 16, duration: 0.04 }, 0)
    .to(copy, { autoAlpha: 0, y: -72, duration: 0.15 }, 0.02)
    .to(wash, { autoAlpha: 0, duration: 0.16 }, 0.02)
    .to(state, { p: 1, duration: 0.8, onUpdate: () => { pos = state.p * (COUNT - 1); } }, 0.05)
    .fromTo(outroParts, { autoAlpha: 0, yPercent: 70 }, { autoAlpha: 1, yPercent: 0, duration: 0.05, stagger: 0.012 }, 0.84)
    .set({}, {}, 1);

  /* Hero entrance, once on load */
  const title = hero.querySelector('.hero__title');
  const intro = gsap.timeline({ defaults: { ease: 'expo.out' } });
  intro.fromTo([canvas, hero.querySelector('.hero__poster')], { scale: 1.08 }, { scale: 1, duration: 2.4, ease: 'power3.out' }, 0);
  if (split) {
    SplitText.create(title, {
      type: 'lines', mask: 'lines', linesClass: 'split-line', autoSplit: true,
      onSplit(self) {
        gsap.set(title, { visibility: 'visible' });
        return gsap.from(self.lines, { yPercent: 110, duration: 1.2, stagger: 0.09, ease: 'expo.out', delay: 0.2 });
      }
    });
  } else {
    gsap.set(title, { visibility: 'visible' });
  }
  intro.fromTo('.hero__lead, .hero__actions', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.1 }, 0.55)
    .from(cue, { autoAlpha: 0, y: -10, duration: 1 }, 1.1);

  /* Section heads rise line by line */
  if (split) {
    document.querySelectorAll('[data-split]').forEach((el) => {
      SplitText.create(el, {
        type: 'lines', mask: 'lines', linesClass: 'split-line', autoSplit: true,
        onSplit(self) {
          return gsap.from(self.lines, {
            yPercent: 110, duration: 1.1, stagger: 0.08, ease: 'expo.out',
            scrollTrigger: { trigger: el, start: 'top 88%', once: true }
          });
        }
      });
    });
  }

  /* Photographs unmask from the bottom as they arrive */
  gsap.utils.toArray('.service__photo, .details__photo').forEach((fig) => {
    const img = fig.querySelector('img');
    gsap.timeline({ scrollTrigger: { trigger: fig, start: 'top 92%', once: true } })
      .fromTo(fig, { clipPath: 'inset(100% 0% 0% 0% round 20px)' }, { clipPath: 'inset(0% 0% 0% 0% round 20px)', duration: 1.4, ease: 'expo.out', clearProps: 'clipPath' }, 0)
      .from(img, { scale: 1.2, duration: 1.8, ease: 'expo.out' }, 0);
  });

  /* Before / after: the frame settles, then the handle shows it can move */
  if (compare && range) {
    let touched = false;
    range.addEventListener('pointerdown', () => { touched = true; });
    range.addEventListener('keydown', () => { touched = true; });
    gsap.fromTo(compare, { scale: 0.9 }, {
      scale: 1, ease: 'none',
      scrollTrigger: { trigger: compare, start: 'top 95%', end: 'top 35%', scrub: 0.5 }
    });
    const hint = { v: 50 };
    const show = () => { if (touched) return; range.value = Math.round(hint.v); compare.style.setProperty('--split', hint.v + '%'); };
    ScrollTrigger.create({
      trigger: compare, start: 'top 45%', once: true,
      onEnter: () => {
        if (touched) return;
        gsap.timeline({ onUpdate: show })
          .to(hint, { v: 26, duration: 0.9, ease: 'power2.inOut' })
          .to(hint, { v: 74, duration: 1.3, ease: 'power2.inOut' })
          .to(hint, { v: 50, duration: 0.9, ease: 'power2.inOut' });
      }
    });
  }

  /* FAQ: the answer eases in when a question opens */
  document.querySelectorAll('.qa').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) gsap.fromTo(d.querySelector('p'), { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out' });
  }));
})();
