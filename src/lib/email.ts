// Outbound email through Resend. Sender: fly@agentriders.com — Resend has the
// root domain verified (its DKIM/SPF records coexist with Cloudflare Email
// Routing's inbound MX). Two messages: magic sign-in links to riders, and
// review-queue notices to the admin.

const FROM = 'AgentRiders <fly@agentriders.com>';

async function send(
  apiKey: string,
  msg: { to: string; subject: string; text: string },
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [msg.to], subject: msg.subject, text: msg.text }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend ${response.status}: ${body.slice(0, 200)}`);
  }
}

export async function sendMagicLinkEmail(apiKey: string, to: string, link: string): Promise<void> {
  await send(apiKey, {
    to,
    subject: 'Your AgentRiders sign-in link',
    text: [
      'Mount up.',
      '',
      'This link signs you in to agentriders.com. It works once and expires in 15 minutes:',
      '',
      link,
      '',
      "If you didn't request it, ignore this email — nothing happens without the link.",
    ].join('\n'),
  });
}

// Review-queue notice to the admin when a rider submits (or re-submits after
// changes). Best-effort: the caller never fails a submission if this throws.
export async function sendSubmissionNotice(
  apiKey: string,
  to: string,
  s: {
    id: string;
    title: string;
    slug: string;
    kind: string;
    handle: string;
    resubmit: boolean;
    origin: string;
  },
): Promise<void> {
  const what = s.kind === 'edit' ? `an edit to /logs/${s.slug}` : 'a new flight log';
  const verb = s.resubmit ? 're-submitted' : 'submitted';
  await send(apiKey, {
    to,
    subject: `Review queue: @${s.handle} ${verb} "${s.title}"`,
    text: [
      `@${s.handle} ${verb} ${what} for review.`,
      '',
      `Title: ${s.title}`,
      `Review it:  ${s.origin}/admin/submissions/${s.id}/`,
      `Full queue: ${s.origin}/admin/`,
    ].join('\n'),
  });
}

// Decision notice to the rider when a reviewer sends a submission back for
// changes or rejects it, carrying the reviewer's notes. Best-effort: the
// caller never fails a decision if this throws.
export async function sendDecisionNotice(
  apiKey: string,
  to: string,
  d: {
    title: string;
    handle: string;
    action: 'request_changes' | 'reject';
    notes: string;
    submissionId: string;
    origin: string;
  },
): Promise<void> {
  const changes = d.action === 'request_changes';
  const subject = changes
    ? `Changes requested on "${d.title}"`
    : `Your flight log "${d.title}" wasn't accepted`;
  const lead = changes
    ? `A reviewer read your flight log "${d.title}" and sent it back with changes to make before it can fly.`
    : `A reviewer read your flight log "${d.title}", and it wasn't accepted for publication this time.`;
  const tail = changes
    ? `Make your edits and resubmit here:\n${d.origin}/logs/new/?id=${d.submissionId}`
    : `You're welcome to file a new one whenever you're ready:\n${d.origin}/logs/new/`;
  await send(apiKey, {
    to,
    subject,
    text: [`@${d.handle},`, '', lead, '', 'Notes from the reviewer:', d.notes, '', tail].join('\n'),
  });
}
