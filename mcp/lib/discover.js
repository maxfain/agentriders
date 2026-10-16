// Find the active Claude Code session log. Claude Code writes
// ~/.claude/projects/<mangled-cwd>/<session-id>.jsonl, where <mangled-cwd> is
// the working directory with every non-alphanumeric character replaced by '-'
// (e.g. /home/u/proj -> -home-u-proj).
//
// Order: explicit path → session id from the environment (scoped to the cwd's
// project dir when cwd is a known project, so we never grab an unrelated
// project's session) → newest *.jsonl in the dir matching cwd → none
// (unverified path). When cwd is not a project dir at all — e.g. Claude Desktop
// launches the stdio server at '/' — the env session id is trusted globally,
// since it's the only grounding signal and is same-user, set at spawn.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function mangleCwd(cwd) {
  return String(cwd).replace(/[^A-Za-z0-9]/g, '-');
}

// Claude Code honors CLAUDE_CONFIG_DIR as a relocated ~/.claude.
export function sessionsBase() {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
}

// Generous ceiling — real session logs are MBs — that still refuses to slurp
// something enormous into memory.
const MAX_SESSION_BYTES = 256 * 1024 * 1024;

// session_log_path is a tool argument, so the model (or a prompt injection)
// chooses it. Only accept a regular *.jsonl file under the sessions dir: no
// /dev/stdin (which would hang the stdio transport), FIFOs, devices, or
// arbitrary files elsewhere on disk.
export function safeSessionPath(candidate) {
  try {
    const real = fs.realpathSync(candidate);
    const base = fs.realpathSync(sessionsBase());
    if (!real.startsWith(base + path.sep) || !real.endsWith('.jsonl')) return null;
    const st = fs.statSync(real);
    return st.isFile() && st.size <= MAX_SESSION_BYTES ? real : null;
  } catch {
    return null;
  }
}

export function discoverSession(explicitPath, cwd = process.cwd()) {
  if (explicitPath) return safeSessionPath(explicitPath);

  const base = sessionsBase();
  if (!fs.existsSync(base)) return null;

  const sessionId = process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || '';
  const files = [];
  let dirs;
  try {
    dirs = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dirPath = path.join(base, d.name);
    let entries;
    try {
      entries = fs.readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!f.endsWith('.jsonl')) continue;
      const p = path.join(dirPath, f);
      let mtime = 0;
      try {
        mtime = fs.statSync(p).mtimeMs;
      } catch {
        /* skip unreadable */
      }
      files.push({ path: p, dir: d.name, id: f.replace(/\.jsonl$/, ''), mtime });
    }
  }
  if (files.length === 0) return null;

  const mangled = mangleCwd(cwd);
  const cwdIsProject = files.some((x) => x.dir === mangled);

  if (sessionId) {
    const hit = files.find((x) => x.id === sessionId);
    if (hit && (!cwdIsProject || hit.dir === mangled)) return hit.path;
  }

  const inCwd = files.filter((x) => x.dir === mangled).sort((a, b) => b.mtime - a.mtime);
  return inCwd.length ? inCwd[0].path : null;
}
