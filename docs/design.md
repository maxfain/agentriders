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
