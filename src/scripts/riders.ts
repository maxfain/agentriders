/** Native buttons, no framework. With no JavaScript, every portrait stays visible. */
const cards = [...document.querySelectorAll<HTMLElement>('[data-rider-card]')];
const revealAll = document.querySelector<HTMLButtonElement>('.riders-reveal-all');
const status = document.querySelector<HTMLElement>('.riders-reveal-status');
function updateSummary() {
  const count = cards.filter(card => card.classList.contains('is-revealed')).length;
  if (status) status.textContent = `${count} / ${cards.length} REVEALED`;
  if (revealAll) revealAll.innerHTML = `${count === cards.length ? 'Show the insignias' : 'Reveal all three'} <span aria-hidden="true">↻</span>`;
}
function turn(card: HTMLElement, reveal: boolean) {
  const button = card.querySelector<HTMLButtonElement>('.rider-portrait__toggle');
  const portrait = card.querySelector<HTMLElement>('.rider-portrait__back');
  card.classList.toggle('is-revealed', reveal);
  button?.setAttribute('aria-pressed', String(reveal));
  button?.setAttribute('aria-label', reveal ? `Show the ${card.dataset.name} insignia` : `Reveal the ${card.dataset.name} portrait`);
  portrait?.setAttribute('aria-hidden', String(!reveal));
}
cards.forEach(card => {
  const button = card.querySelector<HTMLButtonElement>('.rider-portrait__toggle');
  if (!button) return;
  card.classList.add('is-enhanced');
  turn(card, false);
  button.hidden = false;
  button.addEventListener('click', () => { turn(card, !card.classList.contains('is-revealed')); updateSummary(); });
  button.addEventListener('keydown', event => {
    if (event.key === 'Escape' && card.classList.contains('is-revealed')) { turn(card, false); updateSummary(); }
  });
});
if (cards.length && revealAll) {
  revealAll.hidden = false;
  if (status) status.hidden = false;
  document.querySelector<HTMLElement>('.riders-reveal-hint')?.removeAttribute('hidden');
  revealAll.addEventListener('click', () => {
    const reveal = !cards.every(card => card.classList.contains('is-revealed'));
    cards.forEach(card => turn(card, reveal));
    updateSummary();
  });
}
export {};
