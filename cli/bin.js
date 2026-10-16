#!/usr/bin/env node
// agentriders — sign metadata-only flight records with a device key and
// upload them to agentriders.com, earning a "Verified flight" badge.
//
// Commands:
//   agentriders login [code]            pair this machine with your account
//   agentriders log <session.jsonl>     record a session  (--log <slug> to link)
//   agentriders log --latest            record your most recent Claude Code session
//   agentriders whoami                  show this machine's device key
//   agentriders help | --version

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { loadOrCreateKey } from './lib/keys.js';
import { buildRecord } from './lib/record.js';
import { canonicalize } from './lib/canonical.js';
import { linkDevice, postRecord, apiBase } from './lib/api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));
const VERSION = pkg.version;

const BOOL_FLAGS = new Set(['dry-run', 'yes', 'latest', 'help', 'version']);

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (BOOL_FLAGS.has(key)) flags[key] = true;
      else flags[key] = argv[(i += 1)];
    } else if (a === '-h') flags.help = true;
    else if (a === '-v') flags.version = true;
    else if (a === '-y') flags.yes = true;
    else positional.push(a);
  }
  return { positional, flags };
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => (rl.close(), resolve(ans))));
}

async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  const ans = (await prompt(`${question} [y/N] `)).trim().toLowerCase();
  return ans === 'y' || ans === 'yes';
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function findLatestSession() {
  const base = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(base)) return null;
  let best = null;
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.jsonl')) {
        const m = fs.statSync(p).mtimeMs;
        if (!best || m > best.mtime) best = { path: p, mtime: m };
      }
    }
  };
  walk(base);
  return best?.path ?? null;
}

const HELP = `agentriders ${VERSION} — verifiable flight records for people who run AI agents.

Usage:
  agentriders login [code]            Pair this machine with your account.
                                      Get a code at ${apiBase()}/me/devices
  agentriders log <session.jsonl>     Build, sign and upload a flight record.
      --log <slug>                    Link it to one of your published flights.
      --latest                        Use your most recent Claude Code session.
      --dry-run                       Print the exact payload, upload nothing.
      --yes, -y                       Skip the confirmation prompt.
  agentriders whoami                  Show this machine's device key.
  agentriders help | --version

Everything a record contains is metadata — counts, model names, timestamps,
eval signals. No prompts, code, file contents or paths ever leave your machine.
Set AGENTRIDERS_API to point at a non-production server.`;

async function cmdLogin(args) {
  const key = loadOrCreateKey();
  let code = args.positional[0] || args.flags.code;
  if (!code) {
    if (!process.stdin.isTTY) {
      die(`Paste a link code: agentriders login <code>\nGet one at ${apiBase()}/me/devices`);
    }
    code = (await prompt(`Link code (from ${apiBase()}/me/devices): `)).trim();
  }
  if (!code) die('No code given.');
  const name = args.flags.name || `${os.userInfo().username}@${os.hostname()}`;

  const res = await linkDevice({ code, publicKey: key.publicKeyB64, name });
  if (!res.ok) die(`✗ ${res.data.error || `Link failed (HTTP ${res.status}).`}`);
  const who = res.data.handle ? `@${res.data.handle}` : 'your account';
  console.log(`✦ This machine is now linked to ${who}.`);
  console.log(`  Device: ${name}`);
  console.log(`  Key:    ${key.fingerprint.slice(0, 16)}…  (${key.keyFile})`);
  console.log(`\nNext: agentriders log <session.jsonl> --log <your-flight-slug>`);
}

async function cmdLog(args) {
  const key = loadOrCreateKey();
  let file = args.positional[0];
  if (args.flags.latest) {
    file = findLatestSession();
    if (!file) die('No Claude Code sessions found under ~/.claude/projects.');
    console.log(`Latest session: ${file}\n`);
  }
  if (!file) die('Usage: agentriders log <session.jsonl>  (or --latest)');
  if (!fs.existsSync(file)) die(`No such file: ${file}`);

  let payload;
  try {
    payload = buildRecord(fs.readFileSync(file, 'utf8'), { cliVersion: VERSION });
  } catch (err) {
    die(`✗ ${err.message}`);
  }

  console.log('This is everything that leaves your machine:\n');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  if (args.flags['dry-run']) {
    console.log('(dry run — nothing was uploaded)');
    return;
  }

  const slug = args.flags.log || '';
  if (slug) console.log(`It will be linked to your flight: /logs/${slug}\n`);

  if (!args.flags.yes && !(await confirm('Sign and upload this record?'))) {
    die('Cancelled.');
  }

  const signature = key.sign(canonicalize(payload));
  const res = await postRecord({ payload, signature, publicKey: key.publicKeyB64, log: slug });

  if (res.status === 201) {
    console.log('✦ Verified flight recorded.');
    console.log(`  Record:      ${res.data.record_id}`);
    console.log(`  Eval score:  ${res.data.evals_score}`);
    if (res.data.matched_log_slug) {
      console.log(`  Linked to:   /logs/${res.data.matched_log_slug}`);
      console.log('  The badge appears after the next site rebuild.');
    } else if (res.data.match_error) {
      console.log(`  Not linked:  ${res.data.match_error}`);
      console.log('  The record is saved; link it later from /me/devices.');
    } else {
      console.log('  Link it to a published flight any time from /me/devices.');
    }
    return;
  }
  if (res.status === 409) {
    console.log(`• ${res.data.error}`);
    if (res.data.record_id) console.log(`  Existing record: ${res.data.record_id}`);
    return;
  }
  if (res.status === 401) {
    die(`✗ ${res.data.error || 'Device not recognized.'}\n  Run: agentriders login`);
  }
  die(`✗ ${res.data.error || `Upload failed (HTTP ${res.status}).`}`);
}

function cmdWhoami() {
  const key = loadOrCreateKey();
  console.log(`Device key:  ${key.fingerprint}`);
  console.log(`Public key:  ${key.publicKeyB64}`);
  console.log(`Key file:    ${key.keyFile}`);
  console.log(`Created:     ${key.created}`);
  console.log(`API:         ${apiBase()}`);
}

async function main() {
  const [, , command, ...rest] = process.argv;
  const args = parseArgs(rest);

  if (args.flags.api) process.env.AGENTRIDERS_API = args.flags.api;

  if (args.flags.version || command === 'version') return console.log(VERSION);
  if (!command || command === 'help' || args.flags.help) return console.log(HELP);

  switch (command) {
    case 'login':
      return cmdLogin(args);
    case 'log':
      return cmdLog(args);
    case 'whoami':
      return cmdWhoami();
    default:
      die(`Unknown command: ${command}\n\n${HELP}`);
  }
}

main().catch((err) => die(`✗ ${err.stack || err.message}`));
