// The debrief: 40–60 words, present tense, AgentRiders voice — task, what
// happened, outcome. Enforced by validation, not by prompt alone (brief,
// Quality): numbers must match stored fields, quoted words must be a
// substring of reviewer_excerpt, no motive, no sentiment, no advice, no
// exclamation marks, no emoji. Reject and retry once, then leave the debrief
// empty and let the page render without it.

import Anthropic from '@anthropic-ai/sdk';
import { wordCount } from './text.ts';

// v2: tighter word-count target with margin, and the allowed numbers handed to
// the model explicitly — the two things Haiku tripped on in the first backfill
// pass (word-count overshoot past 60, and citing figures it computed itself).
export const DEBRIEF_PROMPT_VERSION = 'v2';

/** The structured record the model sees. Never the diff, never the full body. */
export type DebriefRecord = {
  title: string;
  body_excerpt: string | null;
  agent_label: string;
  repo: string;
  task_type: string | null;
  outcome: string;
  state: string;
  additions: number | null;
  deletions: number | null;
  files_changed: number | null;
  commits: number | null;
  review_count: number | null;
  change_requests: number | null;
  review_comment_count: number | null;
  hours_to_merge: number | null;
  reviewer_excerpt: string | null;
};

const OUTCOME_PHRASES: Record<string, string> = {
  merged_clean: 'merged clean — no changes requested, one review round',
  merged_after_rework: 'merged after rework',
  burn: 'a burn — closed unmerged after human review',
  abandoned: 'abandoned — closed unmerged with no human engagement',
  open: 'still open',
  stale: 'open and stale (30+ days)',
};

export function buildDebriefPrompt(record: DebriefRecord): { system: string; user: string } {
  const system = [
    'You write flight debriefs for AgentRiders, a public log of AI coding-agent pull requests.',
    'Voice: a calm flight-log entry. Present tense. Plain, concrete, no hype.',
    'Guild vocabulary where it fits naturally (a failed flight is a burn; the human is the rider) and plain English where it does not.',
    'Hard rules:',
    '- Length: aim for 48 to 55 words; never fewer than 42 or more than 58. Count the words and trim before replying — running past 60 is the most common mistake.',
    '- One paragraph: the task, what happened, the outcome.',
    '- Facts ONLY from the record you are given. Never guess or embellish.',
    '- Cite a number only if it is in the "Numbers you may cite" list in the message, copied exactly. Spell counts under ten as words (two reviews, four commits). Never state a percentage, a sum, or a rounded figure you worked out yourself.',
    '- Never speculate about motive or feeling. Phrases like "the agent decided" or "the reviewer felt" are forbidden.',
    '- No advice, no judgment, no exclamation marks, no emoji, no markdown.',
    '- If you quote the reviewer, quote the reviewer_excerpt verbatim (a contiguous span, in double quotes) and nothing else. Quoting is optional.',
    'Reply with the debrief text alone.',
  ].join('\n');
  const allowedNums = [
    record.additions, record.deletions, record.files_changed, record.commits,
    record.review_count, record.change_requests, record.review_comment_count, record.hours_to_merge,
  ].filter((n): n is number => typeof n === 'number').map(String);
  const user = [
    'Write the debrief for this flight record:',
    JSON.stringify(
      { ...record, outcome: `${record.outcome} (${OUTCOME_PHRASES[record.outcome] ?? record.outcome})` },
      null,
      1,
    ),
    '',
    allowedNums.length > 0
      ? `Numbers you may cite — ONLY these exact values, nothing else (no percentages, no sums or rounded figures you compute), spelling counts under ten as words: ${allowedNums.join(', ')}.`
      : 'Cite no numbers — none are recorded for this flight.',
  ].join('\n');
  return { system, user };
}

// --- validation --------------------------------------------------------------

const BANNED = /\b(?:agent|reviewer|author|model|rider)s?\s+(?:decided|decides|felt|feels|wanted|wants|hoped|hopes|believed|believes|thought|thinks|intended|intends|chose|tried)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const NUMBER = /\d+(?:\.\d+)?/g;

/** Spans inside double quotes (straight or curly). */
function quotedSpans(text: string): string[] {
  const spans: string[] = [];
  for (const m of text.matchAll(/["“”]([^"“”]+)["“”]/g)) spans.push(m[1]);
  return spans;
}

function allowedNumbers(record: DebriefRecord): Set<string> {
  const allowed = new Set<string>();
  const add = (v: number | null) => {
    if (v === null || v === undefined) return;
    allowed.add(String(v));
    if (!Number.isInteger(v)) {
      allowed.add(v.toFixed(1));
      allowed.add(String(Math.round(v)));
      allowed.add(String(Math.floor(v)));
    }
  };
  add(record.additions);
  add(record.deletions);
  add(record.files_changed);
  add(record.commits);
  add(record.review_count);
  add(record.change_requests);
  add(record.review_comment_count);
  add(record.hours_to_merge);
  if (record.hours_to_merge !== null && record.hours_to_merge >= 24) {
    add(Math.round((record.hours_to_merge / 24) * 10) / 10); // days form
    add(Math.round(record.hours_to_merge / 24));
  }
  // Numbers the title itself carries (issue numbers, version strings) are part
  // of the record; numbers in the reviewer excerpt are covered by the quote rule.
  for (const m of record.title.matchAll(NUMBER)) allowed.add(m[0]);
  return allowed;
}

export type DebriefValidation = { ok: true } | { ok: false; reasons: string[] };

export function validateDebrief(text: string, record: DebriefRecord): DebriefValidation {
  const reasons: string[] = [];
  const trimmed = text.trim();
  const words = wordCount(trimmed);
  if (words < 40 || words > 60) reasons.push(`word count ${words} outside 40–60`);
  if (trimmed.includes('!')) reasons.push('contains an exclamation mark');
  if (EMOJI.test(trimmed)) reasons.push('contains emoji');
  // Markdown markers — but a bare "#4821" issue reference is record language,
  // and single underscores appear in code identifiers.
  if (/[*`\[\]]|__|(^|\n)#\s/.test(trimmed)) reasons.push('contains markdown');

  const quotes = quotedSpans(trimmed);
  const excerpt = record.reviewer_excerpt ?? '';
  for (const q of quotes) {
    if (!excerpt.includes(q)) reasons.push(`quoted words not in reviewer_excerpt: "${q.slice(0, 60)}"`);
  }

  // Banned motive/sentiment phrasing — checked outside verbatim quotes.
  let unquoted = trimmed;
  for (const q of quotes) unquoted = unquoted.split(q).join(' ');
  if (BANNED.test(unquoted)) reasons.push('speculates about motive or feeling');

  const allowed = allowedNumbers(record);
  for (const q of quotes) if (excerpt.includes(q)) allowed.add('__quoted__'); // marker only
  let numberScope = trimmed;
  for (const q of quotes) if (excerpt.includes(q)) numberScope = numberScope.split(q).join(' ');
  for (const m of numberScope.matchAll(NUMBER)) {
    if (!allowed.has(m[0])) reasons.push(`number ${m[0]} not in the record fields`);
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

// --- generation ---------------------------------------------------------------

// claude-haiku-5-5 cuts the ~20k-call backfill cost roughly 40× and this task
// is narrow and machine-validated, but the model stays the operator's choice:
// set DEBRIEF_MODEL to change it.
export const DEFAULT_DEBRIEF_MODEL = 'claude-opus-5-5';

export type DebriefResult =
  | { ok: true; text: string }
  | { ok: false; attempts: string[]; reasons: string[] };

export async function generateDebrief(
  client: Anthropic,
  record: DebriefRecord,
  model = process.env.DEBRIEF_MODEL || DEFAULT_DEBRIEF_MODEL,
): Promise<DebriefResult> {
  const { system, user } = buildDebriefPrompt(record);
  const attempts: string[] = [];
  let lastReasons: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: user }];
    if (attempt > 0 && attempts[0]) {
      messages.push({ role: 'assistant', content: attempts[0] });
      messages.push({
        role: 'user',
        content: `That debrief failed validation: ${lastReasons.join('; ')}. Rewrite it following every hard rule.`,
      });
    }
    const response = await client.messages.create({
      model,
      max_tokens: 2000,
      system,
      output_config: { effort: 'low' },
      messages,
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    attempts.push(text);
    const verdict = validateDebrief(text, record);
    if (verdict.ok) return { ok: true, text };
    lastReasons = verdict.reasons;
  }
  return { ok: false, attempts, reasons: lastReasons };
}
