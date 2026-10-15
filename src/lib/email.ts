// Outbound email through Resend. One sender for now: magic links from
// fly@mail.agentriders.com (the subdomain insulates the root domain's
// reputation; DNS records live in Cloudflare).

const FROM = 'AgentRiders <fly@mail.agentriders.com>';

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
