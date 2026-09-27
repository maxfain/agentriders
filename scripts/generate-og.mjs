// Generates public/og.png (1200x630) in brand colors:
// Custom first-flight artwork, Fraunces headline, and the existing eye mark.
// Generated during the build; the PNG is not committed.
import { readFile, writeFile } from 'node:fs/promises';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const ink = '#16130F';
const bone = '#F2EBDD';
const ember = '#E4572E';
const caption = '#C9BAA7';
const artwork = await readFile(new URL('../public/images/first-flight-og.jpg', import.meta.url));
const artUri = `data:image/jpeg;base64,${artwork.toString('base64')}`;

const fraunces = await readFile(
  new URL('../node_modules/@fontsource/fraunces/files/fraunces-latin-600-normal.woff', import.meta.url),
);
const mono = await readFile(
  new URL('../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff', import.meta.url),
);

const markSvg = `<svg viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 15C7 6 23 6 28 15C23 24 7 24 2 15Z" stroke="${bone}" stroke-width="2" stroke-linejoin="round"/><path d="M15 8.5C12.6 12 12.6 18 15 21.5C17.4 18 17.4 12 15 8.5Z" fill="${ember}"/></svg>`;
const markUri = `data:image/svg+xml;base64,${Buffer.from(markSvg).toString('base64')}`;

const el = (type, style, children) => ({ type, props: { style, children } });

const tree = el(
  'div',
  {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    backgroundColor: ink,
    padding: '54px 64px',
    position: 'relative',
  },
  [
    { type: 'img', props: { src: artUri, width: 1200, height: 630, style: { position: 'absolute', left: 0, top: 0 } } },
    el('div', { display: 'flex', position: 'absolute', left: 0, top: 0, width: '620px', height: '630px', backgroundImage: 'linear-gradient(to right, rgba(22,19,15,0.9), rgba(22,19,15,0))' }, []),
    el('div', { display: 'flex', alignItems: 'center', gap: '14px' }, [
      { type: 'img', props: { src: markUri, width: 52, height: 52 } },
      el('div', { display: 'flex', fontFamily: 'Fraunces', fontSize: '32px', color: bone, letterSpacing: '-0.01em' }, 'AgentRiders'),
    ]),
    el(
      'div',
      {
        display: 'flex',
        fontFamily: 'Fraunces',
        fontSize: '85px',
        position: 'relative',
        lineHeight: 1.02,
        letterSpacing: '-0.025em',
        color: bone,
        maxWidth: '510px',
      },
      'The agents are the easy part.',
    ),
    el('div', { display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono', fontSize: '15px', color: caption }, [
      el('div', { display: 'flex' }, 'The guild for people who run agents'),
      el('div', { display: 'flex', color: ember }, 'agentriders.com'),
    ]),
  ],
);

const svg = await satori(tree, {
  width: 1200,
  height: 630,
  fonts: [
    { name: 'Fraunces', data: fraunces, weight: 600, style: 'normal' },
    { name: 'JetBrains Mono', data: mono, weight: 500, style: 'normal' },
  ],
});

const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
await writeFile(new URL('../public/og.png', import.meta.url), png);
console.log(`public/og.png written (${png.length} bytes)`);
