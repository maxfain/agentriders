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

## Verification — September 27, 2026

- Production build generates all 18 current HTML routes. The standalone TypeScript check for `cinematic.ts` passes. The motion bundle is 1.80 kB gzip, with no added dependency.
- Generated pages checked for one H1, unique IDs, internal file links, image/script references, and anchor destinations: no failures.
- All current routes opened in the Cloudflare preview. Desktop compositions reviewed, with representative phone layouts at 390 and 320 pixels and the Manual at 768 pixels. Phone dragon framing, hero spacing, and the shared hero grid were corrected during review.
- Native flight-stage radios checked with pointer and keyboard; pre-flight rings reflect checkbox changes; mobile navigation closes with Escape; Evals contents links reach their headings; Guild FAQ expands; template copy reports success and its download contains the Markdown template.
- Motion pause/resume and preference persistence verified across pages. Reduced-motion and data-saving behavior audited in code and CSS; OS preference emulation was not available in this browser.
- Newsletter endpoint configured in a separate build: four POST forms, valid actions, no duplicate IDs. Default build restored afterward. No forms submitted.
- Six Manual chapters remain in progress. No published logs exist yet, so log-detail and facet designs are templates rather than generated routes. No production merge performed.

Review captures: [Manual](review/manual-desktop.jpg) and [About / reflected dragon eye](review/about-dragon-eye.jpg).

## Riders character collection

The Riders page now opens on an original dragon-aerie scene. Three engraved insignia cards turn into full-height character portraits: Fledgling, Rider, and Wingleader. Expressions, materials, repairs, instruments, and equipment carry the progression. The Wingleader has the owner's requested battered keyboard clipped to the harness; it remains visible in the portrait crop. These are explicitly illustrated archetypes, not member profiles.

`RiderPortrait.astro`, `riders.css`, and `riders.ts` implement native toggle buttons, individual flips, a reveal-all control, keyboard activation and Escape, and a live revealed count. The flip waits for image decoding, handles load failure, and cancels stale requests. Motion-off and reduced-motion modes swap instantly. With JavaScript unavailable, the portraits and rank requirements remain visible. The three desktop columns become two columns with a featured Wingleader at tablet widths, then a single column on phones.

Built-in generated artwork, final asset names, and complete prompts are recorded in [riders-art-prompts.md](riders-art-prompts.md). Responsive images are self-hosted WebP, with lazy-loaded portraits and an eager hero. No new dependencies, audio, strobe effects, or tracking.

Browser review: desktop, 390-pixel and 320-pixel phone widths, and 768-pixel tablet width; no horizontal page overflow at those sizes. Individual clicks, reveal-all, Space, Enter, Escape, and motion-off behavior verified. The keyboard is visible on the phone and desktop portraits. A fast-scroll image-loading gap was found and addressed with decode-before-reveal. TypeScript and the 18-page production build pass. The temporary review page is removed before delivery.

Capture: [Riders portrait collection](review/riders-revealed.jpg).

## Flight School — September 29, 2026

The owner's “train your agent / train your dragon” content direction adds a free learning path for founders, engineers, and operators. Existing scenes, portraits, interactions, and page sections are preserved. New routes:

- `/training/`: six-lesson Flight School with an original training-aerie hero and a wing-in-flight panorama.
- `/training/[slug]/`: six guided exercises, contrasting briefs, visible acceptance criteria, related Manual references, and editable worksheets.
- `/training/kit/`: six complete Markdown templates, accessible native disclosure previews, optional copy controls, and direct downloads.
- `/missions/` and three mission pages: bounded code, research, and operations exercises with usable fictional inputs and review checks.

Six previously unfinished Manual chapters now contain practical reference guidance. New content is original teaching material, with illustrative examples labeled. It does not claim these exercises are actual customer results or a certification. “Training” is explicitly configuring and evaluating the agent setup, not an assertion of model-weight training or automatic persistent memory. Permissions described in documents are distinguished from controls enforced by the environment.

The homepage gains an additive Flight School invitation; navigation, footer, Riders, Manual, and llms.txt link into the learning path. All 21 pre-existing image files remain byte-identical. Three new illustrations and their responsive WebP assets are documented in `flight-school-art-prompts.md`. Existing motion controls and reduced-motion rules apply; the only new JavaScript is optional clipboard copying. Content, template previews, and downloads remain usable without JavaScript.

The log template remains compatible with the existing numeric-cost schema. It defaults to draft and explains that unknown costs belong in working notes until a supported numeric value is available; example costs must not be published as measured results.

Flight School verification: the production build generates 35 pages. Internal routes, assets, heading/ID uniqueness, ARIA references, and fragment destinations pass structural checks. All six kit previews contain their corresponding source files, and the built downloads match those files. The code mission's unmodified fixture fails three of six checks; a separate reference implementation passes all six. Standalone training-script TypeScript and whitespace checks pass.

Browser review covered the Flight School hero, lesson layout and prompt contrast, longest lesson title, homepage invitation, field-kit disclosure, phone code blocks, and completed Manual at desktop, 390/320-pixel phone frames, and a 768-pixel tablet frame. Native disclosure keyboard control, mobile menu, copy success feedback, and motion pause were exercised. No site-script errors were observed (browser extension errors were excluded). Browser download-event capture was unavailable; direct-download invocation, built-file equality, and rendered download targets were checked instead. The deployed mission-brief Markdown endpoint returned HTTP 200 and byte-matched its source. Reduced-motion and no-JavaScript behavior were audited in source. Long-form reading measure was tightened after review. The temporary noindex review harness is removed from the final branch.

Review capture: [Flight School](review/flight-school-desktop.jpg).
