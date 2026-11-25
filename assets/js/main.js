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

  /* Hero: the scroll wipes the glass */
  const hero = document.querySelector('[data-hero]');
  const video = hero && hero.querySelector('video');
  if (!hero || !video || reduce || !window.gsap || !window.ScrollTrigger) {
    root.classList.add('no-scrub');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  root.classList.add('is-scrub');

  const src = matchMedia('(min-width: 60rem)').matches ? video.dataset.srcLg : video.dataset.srcSm;
  // Stream at once so the scrub works from the first second,
  // then swap to an in-memory copy so every seek is local and instant.
  video.preload = 'auto';
  video.src = src;
  fetch(src).then((r) => r.blob()).then((blob) => {
    const t = video.currentTime;
    video.addEventListener('loadedmetadata', () => { video.currentTime = t; }, { once: true });
    video.src = URL.createObjectURL(blob);
  }).catch(() => {});

  // iOS Safari paints seeks only after one play() from a gesture.
  const unlock = () => { video.play().then(() => video.pause()).catch(() => {}); };
  window.addEventListener('touchstart', unlock, { once: true, passive: true });

  const copy = hero.querySelector('[data-hero-copy]');
  const outro = hero.querySelector('[data-hero-outro]');
  const state = { t: 0 };
  let wanted = 0;

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom bottom', scrub: 0.5 }
  });
  const wash = hero.querySelector('.hero__wash');
  tl.to(copy, { autoAlpha: 0, y: -48, filter: 'blur(10px)', duration: 0.14 }, 0.03)
    .to(wash, { autoAlpha: 0, duration: 0.14 }, 0.03)
    .to(state, { t: 1, duration: 0.8, onUpdate: () => { wanted = state.t; } }, 0.05)
    .fromTo(outro, { autoAlpha: 0, y: 24, filter: 'blur(12px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.1 }, 0.84)
    .set({}, {}, 1);

  // On a phone the frame follows her: she starts on the right and ends in the middle.
  if (matchMedia('(max-width: 40rem)').matches) {
    tl.fromTo(video, { objectPosition: '80% 50%' }, { objectPosition: '50% 50%', duration: 0.5 }, 0.3);
  }

  // Seek on the ticker, one seek in flight at a time.
  gsap.ticker.add(() => {
    const d = video.duration;
    if (!d || video.seeking || video.readyState < 1) return;
    const t = Math.min(d - 0.04, Math.max(0, wanted * d));
    if (Math.abs(video.currentTime - t) > 0.012) video.currentTime = t;
  });

  /* The before / after frame settles to full width as it arrives */
  if (compare) {
    gsap.fromTo(compare, { scale: 0.9 }, {
      scale: 1, ease: 'none',
      scrollTrigger: { trigger: compare, start: 'top 95%', end: 'top 35%', scrub: 0.5 }
    });
  }
})();
