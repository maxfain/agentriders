# AgentRiders — illustrated field journal

## Direction

The September 2026 redesign was requested by the owner to extend the existing design language with cinematic dragon-and-rider artwork and the SVG kit developed in the same design session. This direction supersedes the original brief's no-illustration, no-animation, and homepage-parity constraints. The original brief and root HTML remain historical references.

The site keeps the existing ink (`#16130F`), bone (`#F2EBDD`), and ember (`#E4572E`) tokens and self-hosted Fraunces, Instrument Sans, and JetBrains Mono. The eye remains the primary brand mark. The illustrations convey capability and partnership; the prose and data stay practical.

## Source of truth

- `src/pages/index.astro`: current homepage.
- `src/styles/global.css`: original tokens and common content templates.
- `src/styles/experience.css`: new layout, component styling, and responsive treatment.
- `src/components/Artwork.astro`: responsive, sized WebP artwork with eager/lazy loading.
- `public/badges/`: three editable rank emblems, adapted to the verified brand palette.
- `public/icons/`: sixteen SVG UI icons from the commissioned kit.

## Artwork

Created with the built-in image-generation tool. Compressed responsive assets live at:

- `public/images/first-flight-{800,1200,1672}.webp`
- `public/images/the-bond-{600,1000}.webp`
- `public/images/first-flight-og.jpg` (Open Graph build input)

The full prompts are recorded in `docs/art-prompts.md`. These are illustrations of the site's metaphor, not photographs or evidence of actual flights. UI text remains real HTML. No text is baked into the website artwork.

## Interaction and accessibility

- The pre-flight checklist is a self-check, not a connection to an agent or permission system. It does not execute work or persist state. Native checkboxes remain usable without JavaScript; JS adds the count and progress feedback.
- Mobile navigation and Guild FAQs use native details/summary, with menu Escape and outside-click enhancements.
- All content is present without JavaScript; the entrance animation is optional and disabled for reduced motion.
- Skip link, active nav states, visible focus, checkbox labels, artwork descriptions, decorative SVG accessibility, explicit image dimensions, and responsive sources are included.
- No trackers or framework runtime were added.

## Truthful launch state

Existing unpublished example logs remain drafts. The homepage examples are explicitly illustrative and excluded from `/logs.json`. No members, testimonials, or activity counts are invented. Manual placeholders are marked “Chapter in progress.” Planned Guild pricing is displayed without checkout. When `PUBLIC_NEWSLETTER_ENDPOINT` is absent, the site displays an unavailable state instead of a nonfunctional form. Configuring the variable restores the POST form at build time.

## Review

Changes are intended for a review branch and Cloudflare preview before production merge. Build with `npm ci && npm run build`. The generated `dist/` includes all static routes and machine-readable feeds.

## Cinematic extension

The owner requested a further “shock and awe” pass, including subtle frontier-model reflections in the dragon eye. The new homepage adds:

- `src/components/FlightAtlas.astro`: three native radio controls reveal a preparation, review, or logging briefing. CSS traces the illustrated route. This is a field guide, not a live mission dashboard.
- `src/components/CinematicMotion.astro` and `src/scripts/cinematic.ts`: small dependency-free controller for pointer/scroll camera depth, 22–48 canvas embers, viewport-triggered arrivals, rank-card lighting, a reading line, and a persistent motion toggle.
- `src/styles/cinematic.css`: scene treatments, etched instruments, authored SVG routes, responsive compositions, and motion policies. Loaded by the shared layout so the same motion controls apply throughout the site.
- A full-bleed dragon-eye encounter and three concentric pre-flight rings tied to the real checkboxes. The instrument is a local self-check, not an agent connection.
- Responsive `dragon-eye-{800,1200,1672}.webp` and `beyond-the-clouds-{800,1200,1672}.webp`. Both are lazy loaded. No third-party image requests.

All headings and controls remain HTML. CSS-only flight-stage selection works without JavaScript. Scene motion defaults off for reduced-motion and data-saving preferences, can be paused globally, and stops when scenes leave the viewport or the page is hidden. The particle loop is capped near 30 fps and canvas pixel density at 1.5. No content starts hidden waiting for JavaScript. Phone layouts give the art its own space above the copy; the route controls remain available by touch and keyboard.

## Every-page extension

The owner expanded the request to every page. The shared `PageHero`, `Relic`, `PageCoda`, `ChapterRail`, and `FieldDiagram` components now give every current route a deliberate composition. `inner-world.css` adds the dimensional field book, paper ledger, sealed dispatch, rank display, reading layouts, and engraved legal treatment. These artifacts are native HTML/SVG/CSS, keeping typography sharp and page weight modest.

All seven Manual chapters use the reading layout and an illustrated field plate; the Evals chapter has an on-page contents rail. The six unfinished chapters remain explicitly in progress. The log detail and facet templates share the new covers when real published logs create those routes. The template page now has working copy and download controls. Privacy mentions the local motion preference introduced by this change. Membership, newsletter, directory, and log launch states remain explicit.
