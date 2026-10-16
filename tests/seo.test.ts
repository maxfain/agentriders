import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SITE, ORG_ID, WEBSITE_ID, DATASET_ID, FOUNDER_ID,
  abs, canonicalUrl, clampTitle, clampDescription, jsonLdString, siteGraph,
  orgGraph, website, breadcrumbs, techArticle, article, profilePage,
  learningResource, isoDuration, dataset, softwareApplication, founder, founderPage,
} from '../src/lib/seo.ts';
import { fetchSiteState } from '../src/lib/build-state.ts';

test('abs: site paths become absolute, absolute URLs pass through', () => {
  assert.equal(abs('/manual/'), `${SITE}/manual/`);
  assert.equal(abs('/og.png'), `${SITE}/og.png`);
  assert.equal(abs('https://example.com/x'), 'https://example.com/x');
});

test('canonicalUrl: trailing slash on pages, none on files, no query or hash', () => {
  assert.equal(canonicalUrl('/manual/reins'), `${SITE}/manual/reins/`);
  assert.equal(canonicalUrl('/manual/reins/'), `${SITE}/manual/reins/`);
  assert.equal(canonicalUrl('/'), `${SITE}/`);
  assert.equal(canonicalUrl('/logs.json'), `${SITE}/logs.json`);
  assert.equal(canonicalUrl('/join?error=oauth_state#top'), `${SITE}/join/`);
  assert.equal(canonicalUrl(`${SITE}/riders/maxcr`), `${SITE}/riders/maxcr/`);
});

test('clampTitle: short titles untouched, long ones cut at a word with an ellipsis', () => {
  assert.equal(clampTitle('Reins — AgentRiders'), 'Reins — AgentRiders');
  const long = 'Reins: permissions that are tight enough to be loosened — Field Manual — AgentRiders';
  const out = clampTitle(long);
  assert.ok(out.length <= 60, `too long: ${out.length}`);
  assert.ok(out.endsWith('…'));
  assert.ok(!/[\s—:,]…$/.test(out), `dangling separator: ${out}`);
  assert.ok(long.startsWith(out.slice(0, -1)), 'cut must be a prefix of the input');
  assert.equal(clampTitle('a'.repeat(70), 10).length, 10); // no space: hard cut at max
  assert.equal(clampTitle('  spaced   out  '), 'spaced out'); // whitespace collapses
});

test('clamp: counts code points, so a cut never splits an emoji into a lone surrogate', () => {
  // The 59th character is astral and there is no space past the midpoint.
  const out = clampTitle('a'.repeat(58) + '🚀 and more words — AgentRiders');
  assert.ok(out.isWellFormed(), `lone surrogate: ${JSON.stringify(out)}`);
  assert.ok(out.endsWith('🚀…'));
  assert.equal(Array.from(out).length, 60);
  const desc = clampDescription('b'.repeat(153) + '🚀 more words here follow after the cut');
  assert.ok(desc.isWellFormed());
  assert.ok(Array.from(desc).length <= 155);
  assert.equal(clampTitle('🚀'.repeat(40)), '🚀'.repeat(40)); // 40 code points fit; 80 units would not
});

test('clampDescription: 155 by default, custom max honored', () => {
  const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
  const out = clampDescription(words);
  assert.ok(out.length <= 155);
  assert.ok(out.endsWith('…'));
  assert.equal(clampDescription('short enough'), 'short enough');
  assert.ok(clampDescription(words, 40).length <= 40);
});

test('jsonLdString: "<" and the JS line terminators are escaped, value survives', () => {
  const evil = { name: '</script><script>alert(1)</script>', note: 'a\u2028b\u2029c' };
  const out = jsonLdString(evil);
  assert.ok(!out.includes('</script'), 'raw closing tag leaked');
  assert.ok(!out.includes('<'), 'raw < leaked');
  assert.ok(!out.includes('\u2028') && !out.includes('\u2029'));
  assert.ok(out.includes('\\u003c/script'));
  assert.deepEqual(JSON.parse(out), evil); // still valid JSON, same value
});

test('siteGraph: Organization always, WebSite only on home, page nodes merged without @context', () => {
  const inner = siteGraph({ '@context': 'https://schema.org', '@type': 'Thing', name: 'x' });
  assert.equal(inner['@context'], 'https://schema.org');
  assert.deepEqual(inner['@graph'].map((n: any) => n['@type']), ['Organization', 'Thing']);
  assert.ok(!('@context' in inner['@graph'][1]));

  const home = siteGraph([breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Manual', path: '/manual/' }])], true);
  assert.deepEqual(home['@graph'].map((n: any) => n['@type']), ['Organization', 'WebSite', 'BreadcrumbList']);
  assert.equal(siteGraph(undefined)['@graph'].length, 1);
});

test('orgGraph / website: stable ids, required fields, no SearchAction', () => {
  const org = orgGraph();
  assert.equal(org['@type'], 'Organization');
  assert.equal(org['@id'], ORG_ID);
  assert.equal(org.name, 'AgentRiders');
  assert.equal(org.url, `${SITE}/`);
  assert.ok(org.logo.startsWith(SITE));
  assert.equal(org.sameAs.length, 3);
  assert.equal(org.email, 'hello@agentriders.com');
  assert.deepEqual(org.founder, { '@id': FOUNDER_ID }); // the Person lives on /about

  const site = website();
  assert.equal(site['@type'], 'WebSite');
  assert.equal(site['@id'], WEBSITE_ID);
  assert.deepEqual(site.publisher, { '@id': ORG_ID });
  assert.deepEqual(site.alternateName, ['Agent Riders', 'agentriders.com']);
  assert.ok(!('potentialAction' in site));
});

test('founder / founderPage: the Person behind the Organization\'s founder @id, on /about', () => {
  const f = founder();
  assert.equal(f['@type'], 'Person');
  assert.equal(f['@id'], FOUNDER_ID);
  assert.equal(f['@id'], orgGraph().founder['@id']);
  assert.equal(f.name, 'Max Faingezicht');
  assert.equal(f.url, `${SITE}/about/`);
  assert.deepEqual(f.worksFor, { '@id': ORG_ID });
  assert.ok(f.sameAs.includes('https://github.com/maxfain'));
  assert.ok(f.sameAs.includes(`${SITE}/riders/maxcr/`));
  assert.ok(!('email' in f) && !('address' in f)); // nothing personal on the Person

  const page = founderPage('2026-10-16');
  assert.equal(page['@type'], 'ProfilePage');
  assert.equal(page['@id'], `${SITE}/about/#profile`);
  assert.equal(page.dateModified, '2026-10-16');
  assert.deepEqual(page.mainEntity, f);
  assert.ok(!('dateModified' in founderPage()));
});

test('breadcrumbs: positioned ListItems with canonical item URLs', () => {
  const bc = breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Field Manual', path: '/manual' }]);
  assert.equal(bc['@type'], 'BreadcrumbList');
  assert.equal(bc.itemListElement.length, 2);
  assert.equal(bc.itemListElement[1].position, 2);
  assert.equal(bc.itemListElement[1].item, `${SITE}/manual/`);
});

test('techArticle: dates keep their precision, the default author is the Organization, series when given', () => {
  const a = techArticle({
    headline: 'AI agent permissions (reins)', description: 'd', path: '/manual/reins',
    datePublished: '2026-09-26', dateModified: new Date('2026-09-29T00:00:00Z'),
    authorName: 'AgentRiders', authorPath: '/about/', seriesName: 'The Field Manual', position: 2, keywords: ['reins'],
  });
  assert.equal(a['@type'], 'TechArticle');
  assert.equal(a.url, `${SITE}/manual/reins/`);
  assert.equal(a.datePublished, '2026-09-26'); // a date-only string is not expanded to a timestamp
  assert.equal(a.dateModified, '2026-09-29T00:00:00.000Z');
  // "AgentRiders" is the Organization node, never a Person of the same name.
  assert.deepEqual(a.author, { '@id': ORG_ID });
  assert.equal(a.isPartOf?.name, 'The Field Manual');
  assert.ok(!Object.values(a).includes(undefined));
  const bare = techArticle({ headline: 'h', description: 'd', path: '/manual/x/' });
  assert.deepEqual(bare.author, { '@id': ORG_ID });
  assert.ok(!('isPartOf' in bare) && !('datePublished' in bare));
  // A real byline (S1) is a Person.
  const byline = techArticle({ headline: 'h', description: 'd', path: '/manual/x/', authorName: 'Max', authorPath: '/about/' });
  assert.deepEqual(byline.author, { '@type': 'Person', name: 'Max', url: `${SITE}/about/` });
});

test('article: rider as Person with @handle and profile URL, part of the dataset', () => {
  const a = article({
    headline: 'Shipped Phase 2', description: 'd', path: '/logs/shipped-agentriders-phase-2',
    datePublished: '2026-10-16', riderName: 'maxcr', riderHandle: 'maxcr', riderPath: '/riders/maxcr',
    keywords: ['Claude Code', 'code', 'landed'],
  });
  assert.equal(a['@type'], 'Article');
  assert.equal(a.author.alternateName, '@maxcr');
  assert.equal(a.author.url, `${SITE}/riders/maxcr/`);
  assert.deepEqual(a.isPartOf, { '@id': DATASET_ID });
  assert.deepEqual(a.publisher, { '@id': ORG_ID });
});

test('profilePage: Person main entity; flights written vs vouches received; date-only dateCreated', () => {
  const p = profilePage({
    name: 'Max', handle: 'maxcr', path: '/riders/maxcr', dateCreated: '2026-10-01',
    flights: 14, vouches: 2, sameAs: ['https://github.com/maxfain'],
  });
  assert.equal(p['@type'], 'ProfilePage');
  assert.equal(p.dateCreated, '2026-10-01'); // never a timestamp: the page shows a month
  assert.equal(p.mainEntity['@type'], 'Person');
  assert.equal(p.mainEntity.alternateName, '@maxcr');
  // The rider is the agent of WriteAction (flights) and the object of EndorseAction (vouches).
  assert.equal(p.mainEntity.agentInteractionStatistic.length, 1);
  assert.equal(p.mainEntity.agentInteractionStatistic[0].interactionType, 'https://schema.org/WriteAction');
  assert.equal(p.mainEntity.agentInteractionStatistic[0].userInteractionCount, 14);
  assert.equal(p.mainEntity.interactionStatistic.length, 1);
  assert.equal(p.mainEntity.interactionStatistic[0].interactionType, 'https://schema.org/EndorseAction');
  assert.equal(p.mainEntity.interactionStatistic[0].userInteractionCount, 2);
  assert.ok(!('sameAs' in profilePage({ name: 'M', handle: 'm', path: '/riders/m', dateCreated: '2026-10-01', flights: 1, vouches: 0, sameAs: [] }).mainEntity));
});

test('learningResource: LearningResource + Article inside the free Flight School course', () => {
  const l = learningResource({
    name: 'Your first flight', description: 'd', path: '/training/your-first-flight',
    level: 'Fledgling', timeRequired: 'PT25M', teaches: 'Scoping one small task',
  });
  assert.deepEqual(l['@type'], ['LearningResource', 'Article']);
  assert.equal(l.educationalLevel, 'Fledgling');
  assert.equal(l.isPartOf['@type'], 'Course');
  assert.equal(l.isPartOf.name, 'Flight School');
  assert.equal(l.isPartOf.url, `${SITE}/training/`);
  assert.equal(l.isPartOf.isAccessibleForFree, true);
  assert.ok(!('audience' in l));

  const mission = learningResource({
    name: 'Research with receipts', description: 'd', path: '/missions/research-with-receipts/',
    audience: 'Founders', timeRequired: 'PT50M',
  });
  assert.ok(!('educationalLevel' in mission));
  assert.deepEqual(mission.audience, { '@type': 'Audience', audienceType: 'Founders' });

  // The default author is the Organization; a named author (S1) is a Person.
  assert.deepEqual(l.author, { '@id': ORG_ID });
  assert.deepEqual(learningResource({ name: 'n', description: 'd', path: '/training/x/', authorName: 'AgentRiders' }).author, { '@id': ORG_ID });
  const byline = learningResource({ name: 'n', description: 'd', path: '/training/x/', authorName: 'Max', authorPath: '/about/' });
  assert.deepEqual(byline.author, { '@type': 'Person', name: 'Max', url: `${SITE}/about/` });
});

test('isoDuration: minutes and hours, ranges keep the upper bound, decimals and compounds, never a partial value', () => {
  assert.equal(isoDuration('25-minute exercise'), 'PT25M');
  assert.equal(isoDuration('35–50 minutes'), 'PT50M');
  assert.equal(isoDuration('30-45 min'), 'PT45M');
  assert.equal(isoDuration('2 hours'), 'PT2H');
  assert.equal(isoDuration('1.5 hours'), 'PT1.5H'); // decimal, not PT5H
  assert.equal(isoDuration('1h 30m'), 'PT1H30M');
  assert.equal(isoDuration('1 hour 30 minutes'), 'PT1H30M');
  assert.equal(isoDuration('30m then 1h'), undefined); // not hours-then-minutes: nothing, not PT30M
  assert.equal(isoDuration('1.5h 30m'), undefined); // only the smallest component may be decimal
  assert.equal(isoDuration('a long afternoon'), undefined);
});

test('dataset: the Terms as license (no public reuse grant yet), free, JSON distribution at /logs.json', () => {
  const d = dataset({ name: 'Flight logs', description: 'd', path: '/logs/', temporalCoverage: '2026-09/..' });
  assert.equal(d['@type'], 'Dataset');
  assert.equal(d['@id'], DATASET_ID);
  assert.equal(d.license, `${SITE}/terms/`);
  assert.equal(d.isAccessibleForFree, true);
  assert.equal(d.distribution[0].contentUrl, `${SITE}/logs.json`);
  assert.equal(d.distribution[0].encodingFormat, 'application/json');
  assert.ok(!('aggregateRating' in d));
});

test('softwareApplication: free, MIT, with install and repository URLs', () => {
  const s = softwareApplication({
    name: 'agentriders', description: 'CLI', version: '0.1.0',
    installUrl: 'https://www.npmjs.com/package/agentriders', codeRepository: 'https://github.com/maxfain/agentriders',
  });
  assert.equal(s['@type'], 'SoftwareApplication');
  assert.equal(s.offers.price, '0');
  assert.equal(s.license, 'https://spdx.org/licenses/MIT.html');
  assert.equal(s.softwareVersion, '0.1.0');
  assert.ok(!('aggregateRating' in s));
});

// ---- site-state profiles (feeds the sitemap's rider URLs) -----------------

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.SITE_STATE_ORIGIN;
});

test('fetchSiteState: carries profiles with ≥1 flight, drops malformed rows, defaults to []', async () => {
  process.env.SITE_STATE_ORIGIN = 'http://fixture.local';
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({
      handles: ['maxcr'], verified: {},
      profiles: [
        { handle: 'maxcr', flights: 3, updated: '2026-10-16T04:00:00.000Z' },
        { handle: 'zero', flights: 0, updated: '2026-10-16T04:00:00.000Z' },
        { handle: 'broken' },
      ],
    }), { status: 200 })) as typeof fetch;
  const state = await fetchSiteState();
  assert.deepEqual(state.profiles, [{ handle: 'maxcr', flights: 3, updated: '2026-10-16T04:00:00.000Z' }]);

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ handles: [], verified: {} }), { status: 200 })) as typeof fetch;
  assert.deepEqual((await fetchSiteState()).profiles, []);
});
