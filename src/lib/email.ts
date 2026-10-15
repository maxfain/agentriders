// Outbound email through Resend. One sender for now: magic links from
// fly@agentriders.com — Resend has the root domain verified (its
// DKIM/SPF records coexist with Cloudflare Email Routing's inbound MX).

const FROM = 'AgentRiders <fly@agentriders.com>';

export async function sendMagicLinkEmail(
  apiKey: string,
  to: string,
  link: string,
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
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
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend ${response.status}: ${body.slice(0, 200)}`);
  }
}
