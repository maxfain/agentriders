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
