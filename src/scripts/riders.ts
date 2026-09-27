/** Native buttons, no framework. With no JavaScript, every portrait stays visible. */
const cards = [...document.querySelectorAll<HTMLElement>('[data-rider-card]')];
const revealAll = document.querySelector<HTMLButtonElement>('.riders-reveal-all');
const status = document.querySelector<HTMLElement>('.riders-reveal-status');
const requests = new WeakMap<HTMLElement, number>();
const targets = new WeakMap<HTMLElement, boolean>();
function updateSummary() {
  const count = cards.filter(card => card.classList.contains('is-revealed')).length;
  if (status) status.textContent = `${count} / ${cards.length} REVEALED`;
  if (revealAll) revealAll.innerHTML = `${count === cards.length ? 'Show the insignias' : 'Reveal all three'} <span aria-hidden="true">↻</span>`;
}
async function turn(card: HTMLElement, reveal: boolean) {
  const button = card.querySelector<HTMLButtonElement>('.rider-portrait__toggle');
  const portrait = card.querySelector<HTMLElement>('.rider-portrait__back');
  const image = card.querySelector<HTMLImageElement>('.rider-portrait__image');
  const invitation = card.querySelector<HTMLElement>('.rider-portrait__invitation > span');
  const request = (requests.get(card) || 0) + 1;
  requests.set(card, request);
  targets.set(card, reveal);
  button?.removeAttribute('aria-busy');
  card.classList.remove('is-loading');
  if (invitation) invitation.textContent = `MEET THE ${card.dataset.name?.toUpperCase()}`;
  // A fast jump to a lazy-loaded card must not reveal an empty image panel.
  if (reveal && image && (!image.complete || !image.naturalWidth)) {
    image.loading = 'eager';
    button?.setAttribute('aria-busy', 'true');
    card.classList.add('is-loading');
    if (invitation) invitation.textContent = 'PREPARING THE PORTRAIT…';
    try { await image.decode(); }
    catch {
      if (requests.get(card) !== request) return;
      targets.set(card, false);
      button?.removeAttribute('aria-busy');
      card.classList.remove('is-loading');
      if (invitation) invitation.textContent = 'IMAGE UNAVAILABLE · TRY AGAIN';
      if (status) status.textContent = `The ${card.dataset.name} portrait could not load. Turn the card to try again.`;
      return;
    }
    if (requests.get(card) !== request) return;
    button?.removeAttribute('aria-busy');
    card.classList.remove('is-loading');
    if (invitation) invitation.textContent = `MEET THE ${card.dataset.name?.toUpperCase()}`;
  }
  card.classList.toggle('is-revealed', reveal);
  button?.setAttribute('aria-pressed', String(reveal));
  button?.setAttribute('aria-label', reveal ? `Show the ${card.dataset.name} insignia` : `Reveal the ${card.dataset.name} portrait`);
  portrait?.setAttribute('aria-hidden', String(!reveal));
  updateSummary();
}
cards.forEach(card => {
  const button = card.querySelector<HTMLButtonElement>('.rider-portrait__toggle');
  if (!button) return;
  card.classList.add('is-enhanced');
  turn(card, false);
  button.hidden = false;
  button.addEventListener('click', () => { void turn(card, !targets.get(card)); });
  button.addEventListener('keydown', event => {
    if (event.key === 'Escape' && targets.get(card)) { void turn(card, false); }
  });
});
if (cards.length && revealAll) {
  revealAll.hidden = false;
  if (status) status.hidden = false;
  document.querySelector<HTMLElement>('.riders-reveal-hint')?.removeAttribute('hidden');
  revealAll.addEventListener('click', () => {
    const reveal = !cards.every(card => targets.get(card));
    cards.forEach(card => { void turn(card, reveal); });
  });
}
export {};
