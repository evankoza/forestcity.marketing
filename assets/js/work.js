/* ==============================================================
   The screenshot pile in "what we do": it shuffles, and a click
   opens the enlarged view (#shot-view).
   ============================================================== */

(() => {
  const stage = document.querySelector('.stack__stage');
  const cards = [...stage.querySelectorAll('.stack__card')];
  const view  = document.getElementById('shot-view');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => requestAnimationFrame(() => stage.parentElement.classList.add('is-live')));

  // Shuffle: every few seconds the front card steps out and goes to the back.
  // Paused while someone is hovering or focused on the pile, while the
  // enlarged view is open, and while the pile is off screen.
  let paused = false, visible = true;
  const shuffle = () => {
    if (paused || !visible || view.open) return;
    const front = cards.find(c => c.dataset.slot === '2');
    front.classList.add('is-out');
    setTimeout(() => {
      cards.forEach(c => c.dataset.slot = c === front ? '0' : String(+c.dataset.slot + 1));
      front.classList.remove('is-out');
    }, 350);
  };
  if (!still) setInterval(shuffle, 3600);
  stage.addEventListener('pointerenter', () => paused = true);
  stage.addEventListener('pointerleave', () => paused = false);
  stage.addEventListener('focusin',  () => paused = true);
  stage.addEventListener('focusout', () => paused = false);
  // Cards with data-clip get their animation looped over the screenshot,
  // unless motion is reduced. Clips only play while the pile is on screen.
  const clips = still ? [] : cards.filter(c => c.dataset.clip).map(c => {
    const v = Object.assign(document.createElement('video'), { muted: true, loop: true, playsInline: true, preload: 'none' });
    v.poster = c.querySelector('img').src;
    v.src = c.dataset.clip;
    v.setAttribute('aria-hidden', 'true');
    c.append(v);
    return v;
  });
  const playClips = on => clips.forEach(v => on ? v.play().catch(() => {}) : v.pause());

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; playClips(visible && !view.open); }).observe(stage);
  // browsers pause silent video in background tabs; pick back up on return
  document.addEventListener('visibilitychange', () => playClips(!document.hidden && visible && !view.open));

  // Enlarge, with previous / next and the arrow keys
  const img = view.querySelector('img'), clip = view.querySelector('video'), title = view.querySelector('b'), note = view.querySelector('p span');
  let at = 0;
  const show = i => {
    at = (i + cards.length) % cards.length;
    const c = cards[at];
    const { title: t = '', note: n = '' } = c.dataset;   // a card can go uncaptioned
    img.src = c.dataset.full;
    const moving = !still && c.dataset.clipFull;
    img.hidden = !!moving; clip.hidden = !moving;
    if (moving) { clip.poster = c.dataset.full; clip.src = c.dataset.clipFull; clip.play().catch(() => {}); }
    else clip.removeAttribute('src');
    img.alt = [t, n].filter(Boolean).join(', ') || c.querySelector('img').alt.replace(/^Enlarge: /, '');
    title.textContent = t; note.textContent = n;
  };
  cards.forEach((c, i) => c.addEventListener('click', () => { show(i); view.showModal(); playClips(false); }));
  view.addEventListener('close', () => { clip.pause(); clip.removeAttribute('src'); playClips(visible); });
  view.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => show(at + +b.dataset.step)));
  view.querySelector('[data-close]').addEventListener('click', () => view.close());
  view.addEventListener('click', e => { if (e.target === view) view.close(); });   // the backdrop
  view.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft')  show(at - 1);
    if (e.key === 'ArrowRight') show(at + 1);
  });
})();
