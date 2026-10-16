// agentriders_file_flight_log — OUTWARD-FACING. Requires confirm === true.
// Creates a submission into the human review queue (never straight to Git) and,
// on the verified path, uploads the signed flight record.

import { parseMarkdown } from '../lib/frontmatter.js';
import { validateComposer } from '../lib/validate.js';
import { slugify, isValidSlug } from '../lib/slug.js';
import { canonicalize } from '../../cli/lib/canonical.js';
import { loadOrCreateKey } from '../../cli/lib/keys.js';
import { signedFetch, postRecord } from '../../cli/lib/api.js';

export async function fileFlightLog(input = {}) {
  if (input.confirm !== true) {
    return {
      error:
        'Refused: filing requires confirm: true. Run agentriders_draft_flight_log, show the user the exact egress payload and the rider-asserted fields, and only file once they confirm.',
    };
  }
  if (!input.markdown || typeof input.markdown !== 'string') return { error: 'markdown is required.' };

  // Re-parse the markdown we were handed — never trust a stale draft object.
  let parsed;
  try {
    parsed = parseMarkdown(input.markdown);
  } catch (e) {
    return { error: e.message };
  }
  const { frontmatter, body } = parsed;

  // Re-validate before anything leaves the machine — the cost rule and bounds
  // are enforced here, not just advised by draft, so a confirmed file() can't
  // fail late with a server 400 (or slip a cost_usd:0 "unchecked" past).
  const { issues } = validateComposer(frontmatter);
  if (issues.length) {
    return { error: 'The flight log does not validate — fix these and re-draft before filing.', issues };
  }

  const slug = input.slug && isValidSlug(input.slug) ? input.slug : slugify(frontmatter.title || '');
  const composer = { ...frontmatter, slug, body_md: body };

  const key = loadOrCreateKey();

  // 1. Create the draft submission (device-authed).
  const created = await signedFetch({ method: 'POST', path: '/api/submissions', body: composer, keypair: key });
  if (created.status !== 201) {
    return { error: created.data.error || `Submission failed (HTTP ${created.status}).`, issues: created.data.issues };
  }
  const id = created.data.id;

  // 2. Move it into the review queue.
  const submitted = await signedFetch({ method: 'POST', path: `/api/submissions/${id}/submit`, keypair: key });
  const status = submitted.status === 200 ? 'submitted' : 'draft';
  const submitNote = submitted.status === 200 ? null : submitted.data.error || 'Saved as a draft but could not enter review.';

  // 3. Verified path: upload the signed, metadata-only flight record. The log
  //    isn't published yet, so the match is attempted and reported — the badge
  //    lights once the log publishes and the record is linked.
  let record = null;
  if (input.egress_payload) {
    const signature = key.sign(canonicalize(input.egress_payload));
    const rec = await postRecord({
      payload: input.egress_payload,
      signature,
      publicKey: key.publicKeyB64,
      log: input.link_to_slug || slug,
    });
    if (rec.status === 201) {
      record = { uploaded: true, matched_log_slug: rec.data.matched_log_slug, evals_score: rec.data.evals_score, match_error: rec.data.match_error };
    } else if (rec.status === 409) {
      record = { uploaded: false, note: rec.data.error, record_id: rec.data.record_id };
    } else {
      record = { uploaded: false, error: rec.data.error || `Record upload failed (HTTP ${rec.status}).` };
    }
  }

  return {
    submission: { id, slug, status, url: `/logs/${slug}` },
    submit_note: submitNote,
    record,
    note: 'Pending admin review — not yet public. A verified record is self-attested: it proves your device signed this session metadata, not that every number is true. The Verified badge appears after approval, once the record is linked to the published log (from /me/devices).',
  };
}
