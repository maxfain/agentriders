/** Optional, dependency-free scene motion. Reading and controls never need this file. */
const root = document.documentElement;
const toggle = document.querySelector<HTMLButtonElement>('.motion-toggle');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)');
const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
const storageKey = 'agentriders-motion';
let preference: string | null = null;
try { preference = localStorage.getItem(storageKey); } catch { /* Storage is optional. */ }
let enabled = !reduced.matches && !connection?.saveData && preference !== 'off';
let frame = 0;
let last = 0;
let dirty = true;
let pointerX = 0;
let pointerY = 0;
let easedX = 0;
let easedY = 0;
let viewportHeight = innerHeight;
const scenes = [...document.querySelectorAll<HTMLElement>('[data-scene]')];
const visible = new Set<HTMLElement>();
const reading = document.querySelector<HTMLElement>('.reading-flight span');
const canvas = document.querySelector<HTMLCanvasElement>('.ember-field');
const context = canvas?.getContext('2d', { alpha: true });
const hero = canvas?.closest<HTMLElement>('[data-scene]');
let width = 0;
let height = 0;
let particles: { x: number; y: number; radius: number; speed: number; phase: number }[] = [];

function sizeCanvas() {
  viewportHeight = innerHeight;
  dirty = true;
  if (!canvas || !context || !hero) return;
  width = hero.clientWidth;
  height = Math.min(hero.clientHeight, 1000);
  const ratio = Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  // Small, bounded particle field; no textures, blur filters, or animation library.
  particles = Array.from({ length: width < 700 ? 22 : 48 }, () => ({
    x: Math.random() * width, y: Math.random() * height,
    radius: .45 + Math.random() * 1.3, speed: 9 + Math.random() * 17, phase: Math.random() * Math.PI * 2,
  }));
}
function updateScroll() {
  const max = document.documentElement.scrollHeight - viewportHeight;
  reading?.style.setProperty('transform', `scaleX(${max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0})`);
  for (const scene of visible) {
    const bounds = scene.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (viewportHeight - bounds.top) / (viewportHeight + bounds.height)));
    scene.style.setProperty('--scene-shift', `${((progress - .5) * 64).toFixed(2)}px`);
    scene.style.setProperty('--scene-scale', `${(1.055 + progress * .04).toFixed(4)}`);
  }
  dirty = false;
}
function render(time: number) {
  frame = 0;
  if (!enabled || document.hidden || !visible.size) return;
  // 30 fps is enough for atmospheric motion and keeps the work modest.
  if (time - last < 32) { schedule(); return; }
  const delta = Math.min((time - last) / 1000, .05);
  last = time;
  if (dirty) updateScroll();
  easedX += (pointerX - easedX) * .055;
  easedY += (pointerY - easedY) * .055;
  for (const scene of visible) {
    scene.style.setProperty('--pointer-x', `${(easedX * 12).toFixed(2)}px`);
    scene.style.setProperty('--pointer-y', `${(easedY * 8).toFixed(2)}px`);
  }
  if (context && canvas && hero && visible.has(hero)) {
    context.clearRect(0, 0, width, height);
    for (const p of particles) {
      p.y -= p.speed * delta;
      p.x += (5 + Math.sin(time / 1900 + p.phase) * 6) * delta;
      if (p.y < -8) { p.y = height + 8; p.x = Math.random() * width; }
      if (p.x > width + 8) p.x = -8;
      const alpha = .18 + (Math.sin(time / 1500 + p.phase) + 1) * .22;
      context.fillStyle = `rgba(244,156,82,${alpha})`;
      context.beginPath(); context.arc(p.x, p.y, p.radius, 0, Math.PI * 2); context.fill();
      context.fillStyle = `rgba(228,87,46,${alpha * .15})`;
      context.beginPath(); context.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2); context.fill();
    }
  }
  schedule();
}
function schedule() {
  if (enabled && !document.hidden && visible.size && !frame) frame = requestAnimationFrame(render);
}
function applyMotion() {
  root.dataset.motion = enabled ? 'running' : 'paused';
  if (toggle) {
    toggle.hidden = false;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.setAttribute('aria-label', enabled ? 'Pause visual motion' : 'Enable visual motion');
    const label = toggle.querySelector('.motion-toggle__label');
    if (label) label.textContent = enabled ? 'Motion on' : 'Motion off';
  }
  if (!enabled) {
    cancelAnimationFrame(frame); frame = 0;
    context?.clearRect(0, 0, width, height);
    scenes.forEach((scene) => { scene.style.removeProperty('--scene-shift'); scene.style.removeProperty('--scene-scale'); scene.style.removeProperty('--pointer-x'); scene.style.removeProperty('--pointer-y'); });
  } else { dirty = true; last = performance.now(); schedule(); }
}
const sceneObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const scene = entry.target as HTMLElement;
    scene.toggleAttribute('data-in-view', entry.isIntersecting);
    if (entry.isIntersecting) visible.add(scene); else visible.delete(scene);
  }
  dirty = true;
  if (!visible.size) { cancelAnimationFrame(frame); frame = 0; }
  schedule();
}, { threshold: 0 });
scenes.forEach((scene) => sceneObserver.observe(scene));
const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: .12 });
document.querySelectorAll('[data-reveal]').forEach((element) => revealObserver.observe(element));
toggle?.addEventListener('click', () => {
  // System reduced motion remains authoritative; the control still pauses everything else.
  enabled = !enabled && !reduced.matches;
  preference = enabled ? 'on' : 'off';
  try { localStorage.setItem(storageKey, preference); } catch { /* No persistence required. */ }
  applyMotion();
});
reduced.addEventListener('change', () => { enabled = !reduced.matches && !connection?.saveData && preference !== 'off'; applyMotion(); });
addEventListener('pointermove', (event) => {
  if (!enabled || !finePointer.matches) return;
  pointerX = (event.clientX / innerWidth - .5) * 2;
  pointerY = (event.clientY / innerHeight - .5) * 2;
}, { passive: true });
addEventListener('scroll', () => { dirty = true; if (!enabled || !visible.size) updateScroll(); schedule(); }, { passive: true });
addEventListener('resize', sizeCanvas, { passive: true });
document.addEventListener('visibilitychange', () => {
  root.toggleAttribute('data-page-hidden', document.hidden);
  if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else { dirty = true; schedule(); }
});
document.querySelectorAll<HTMLElement>('[data-tilt]').forEach((card) => {
  card.addEventListener('pointermove', (event) => {
    if (!enabled || !finePointer.matches) return;
    const box = card.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    card.style.setProperty('--tilt-x', `${(y - .5) * -5}deg`);
    card.style.setProperty('--tilt-y', `${(x - .5) * 5}deg`);
    card.style.setProperty('--light-x', `${x * 100}%`);
    card.style.setProperty('--light-y', `${y * 100}%`);
  }, { passive: true });
  card.addEventListener('pointerleave', () => {
    card.style.removeProperty('--tilt-x'); card.style.removeProperty('--tilt-y');
  });
});
sizeCanvas();
updateScroll();
applyMotion();
