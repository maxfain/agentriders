// OG cards (1200×630) in the site's brand system — the palette, the eye mark
// and the Fraunces/JetBrains Mono pairing from scripts/generate-og.mjs.
// Rendered by the pipeline (satori + resvg don't fit Pages Functions) and
// uploaded to Supabase Storage; a page only points at a card after
// og_generated_at is stamped, so og:image never 404s.

import { readFile } from 'node:fs/promises';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const ink = '#16130F';
const bone = '#F2EBDD';
const ember = '#E4572E';
const caption = '#C9BAA7';
const moss = '#7A8450';

const markSvg = `<svg viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 15C7 6 23 6 28 15C23 24 7 24 2 15Z" stroke="${bone}" stroke-width="2" stroke-linejoin="round"/><path d="M15 8.5C12.6 12 12.6 18 15 21.5C17.4 18 17.4 12 15 8.5Z" fill="${ember}"/></svg>`;
const markUri = `data:image/svg+xml;base64,${Buffer.from(markSvg).toString('base64')}`;

type Node = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, children },
});

let fontsPromise: Promise<{ name: string; data: Buffer; weight: number; style: 'normal' }[]> | null = null;
function fonts() {
  fontsPromise ??= Promise.all([
    readFile(new URL('../node_modules/@fontsource/fraunces/files/fraunces-latin-600-normal.woff', import.meta.url)),
    readFile(new URL('../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff', import.meta.url)),
  ]).then(([fraunces, mono]) => [
    { name: 'Fraunces', data: fraunces, weight: 600, style: 'normal' as const },
    { name: 'JetBrains Mono', data: mono, weight: 500, style: 'normal' as const },
  ]);
  return fontsPromise;
}

export const OUTCOME_LABELS: Record<string, string> = {
  merged_clean: 'MERGED CLEAN',
  merged_after_rework: 'MERGED AFTER REWORK',
  burn: 'BURN',
  abandoned: 'ABANDONED',
  open: 'OPEN',
  stale: 'STALE',
};

const OUTCOME_COLORS: Record<string, string> = {
  merged_clean: moss,
  merged_after_rework: moss,
  burn: ember,
  abandoned: caption,
  open: caption,
  stale: caption,
};

async function render(tree: Node): Promise<Buffer> {
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts: await fonts() });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng());
}

const header = el('div', { alignItems: 'center', gap: '14px' }, [
  { type: 'img', props: { src: markUri, width: 44, height: 44 } },
  el('div', { fontFamily: 'Fraunces', fontSize: '28px', color: bone }, 'AgentRiders — Flight Log'),
]);

function footer(left: string) {
  return el(
    'div',
    { justifyContent: 'space-between', fontFamily: 'JetBrains Mono', fontSize: '15px', color: caption },
    [el('div', {}, left), el('div', { color: ember }, 'agentriders.com')],
  );
}

export type FlightCard = {
  title: string;
  repo: string;
  number: number;
  agentLabel: string;
  outcome: string | null;
  additions: number | null;
  deletions: number | null;
  filesChanged: number | null;
  hoursToMerge: number | null;
};

export async function flightCard(f: FlightCard): Promise<Buffer> {
  const stats: string[] = [];
  if (f.additions !== null && f.deletions !== null) stats.push(`+${f.additions} −${f.deletions}`);
  if (f.filesChanged !== null) stats.push(`${f.filesChanged} ${f.filesChanged === 1 ? 'file' : 'files'}`);
  if (f.hoursToMerge !== null) stats.push(`${Number(f.hoursToMerge) < 48 ? `${Math.round(Number(f.hoursToMerge))}h` : `${Math.round(Number(f.hoursToMerge) / 24)}d`} to merge`);
  const title = f.title.length > 90 ? `${f.title.slice(0, 89)}…` : f.title;
  const outcome = f.outcome ?? 'open';
  const tree = el(
    'div',
    {
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: ink,
      padding: '54px 64px',
    },
    [
      header,
      el('div', { flexDirection: 'column', gap: '26px' }, [
        el('div', { gap: '14px', alignItems: 'center' }, [
          el(
            'div',
            {
              fontFamily: 'JetBrains Mono',
              fontSize: '17px',
              color: ink,
              backgroundColor: OUTCOME_COLORS[outcome] ?? caption,
              padding: '6px 14px',
              borderRadius: '4px',
            },
            OUTCOME_LABELS[outcome] ?? outcome.toUpperCase(),
          ),
          el('div', { fontFamily: 'JetBrains Mono', fontSize: '17px', color: caption }, `${f.agentLabel} flight`),
        ]),
        el(
          'div',
          {
            fontFamily: 'Fraunces',
            fontSize: title.length > 60 ? '46px' : '58px',
            lineHeight: 1.06,
            letterSpacing: '-0.02em',
            color: bone,
            maxWidth: '1050px',
          },
          title,
        ),
        el('div', { fontFamily: 'JetBrains Mono', fontSize: '21px', color: caption, gap: '28px' },
          stats.map((s) => el('div', {}, s))),
      ]),
      footer(`${f.repo}#${f.number}`),
    ],
  );
  return render(tree);
}

export type RiderCard = {
  handle: string;
  rank: string | null;
  flights: number;
  mergeRate: number | null; // 0..1
  burnsSurvived: number;
  agents: string[];
};

export async function riderCard(r: RiderCard): Promise<Buffer> {
  const stats = [
    `${r.flights} ${r.flights === 1 ? 'flight' : 'flights'}`,
    r.mergeRate !== null ? `${Math.round(r.mergeRate * 100)}% merged` : null,
    `${r.burnsSurvived} ${r.burnsSurvived === 1 ? 'burn' : 'burns'} survived`,
  ].filter((s): s is string => s !== null);
  const tree = el(
    'div',
    {
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: ink,
      padding: '54px 64px',
    },
    [
      header,
      el('div', { flexDirection: 'column', gap: '20px' }, [
        el('div', { fontFamily: 'JetBrains Mono', fontSize: '19px', color: ember },
          (r.rank ?? 'rider').toUpperCase()),
        el(
          'div',
          { fontFamily: 'Fraunces', fontSize: '84px', lineHeight: 1, letterSpacing: '-0.02em', color: bone },
          `@${r.handle}`,
        ),
        el('div', { fontFamily: 'JetBrains Mono', fontSize: '22px', color: caption, gap: '28px' },
          stats.map((s) => el('div', {}, s))),
        r.agents.length > 0
          ? el('div', { fontFamily: 'JetBrains Mono', fontSize: '17px', color: caption },
              `flies ${r.agents.slice(0, 4).join(' · ')}`)
          : el('div', {}, ''),
      ]),
      footer(`riders/${r.handle}`),
    ],
  );
  return render(tree);
}
