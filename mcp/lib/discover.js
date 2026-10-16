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

export function discoverSession(explicitPath, cwd = process.cwd()) {
  if (explicitPath) return fs.existsSync(explicitPath) ? explicitPath : null;

  const base = path.join(os.homedir(), '.claude', 'projects');
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
