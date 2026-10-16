#!/usr/bin/env node
// AgentRiders MCP server — lets an AI agent file its own flight log as tool
// calls, grounded in real session telemetry, metadata-only, and always routed
// through the human review queue. stdio transport.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { status } from './tools/status.js';
import { linkDeviceTool } from './tools/link.js';
import { draftFlightLog } from './tools/draft.js';
import { fileFlightLog } from './tools/file.js';
import { TASK_VALUES, OUTCOME_VALUES } from './lib/slug.js';

// AGENTRIDERS_BASE_URL is the documented knob; the shared core reads
// AGENTRIDERS_API, so bridge them once here.
process.env.AGENTRIDERS_API =
  process.env.AGENTRIDERS_BASE_URL || process.env.AGENTRIDERS_API || 'https://agentriders.com';

const server = new McpServer({ name: 'agentriders', version: '0.1.0' });

const asResult = (obj) => ({
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
  structuredContent: typeof obj === 'string' ? undefined : obj,
});

server.registerTool(
  'agentriders_status',
  {
    description:
      'Show this machine\'s AgentRiders device key, who it is linked to, the base URL, and whether a Claude Code session log is discoverable. Read-only.',
    inputSchema: {},
  },
  async () => asResult(await status()),
);

server.registerTool(
  'agentriders_link_device',
  {
    description:
      'Register this machine\'s device key to your rider account using a one-time 8-character code from <baseUrl>/me/devices.',
    inputSchema: { code: z.string().describe('The 8-char code from /me/devices'), name: z.string().optional() },
  },
  async (args) => asResult(await linkDeviceTool(args)),
);

const reins = z.object({
  scope: z.string(),
  budget: z.string(),
  kill_switch: z.string(),
  autonomy: z.string(),
});
const burn = z.object({ what: z.string(), recovery: z.string(), cost_usd: z.number().nonnegative().default(0) });

server.registerTool(
  'agentriders_draft_flight_log',
  {
    description:
      'LOCAL, sends nothing. Build a flight-log draft, grounding duration/model/date in the session telemetry when it can and marking everything else as your own (rider-asserted) claim. Shows the exact metadata-only payload that agentriders_file_flight_log would upload. cost_usd must be a measured amount > 0.',
    inputSchema: {
      session_log_path: z.string().optional(),
      title: z.string(),
      task: z.enum(TASK_VALUES),
      outcome: z.enum(OUTCOME_VALUES),
      cost_usd: z.number(),
      lesson: z.string(),
      reins,
      burns: z.array(burn).optional(),
      body: z.string().optional(),
      slug: z.string().optional(),
      mount: z.string().optional(),
      model: z.string().optional(),
      harness: z.string().optional(),
      duration: z.string().optional(),
      date: z.string().optional(),
    },
  },
  async (args) => {
    const r = draftFlightLog(args);
    return {
      content: [{ type: 'text', text: `${r.agent_instruction}\n\n${JSON.stringify(r, null, 2)}` }],
      structuredContent: r,
    };
  },
);

server.registerTool(
  'agentriders_file_flight_log',
  {
    description:
      'OUTWARD-FACING. Requires confirm: true. Files the draft into the human review queue (never straight to Git) and, on the verified path, uploads the signed flight record. Show the user the egress payload from the draft first.',
    inputSchema: {
      slug: z.string(),
      markdown: z.string(),
      egress_payload: z.any().optional(),
      confirm: z.boolean(),
      link_to_slug: z.string().optional(),
    },
  },
  async (args) => {
    const r = await fileFlightLog(args);
    return r.error
      ? { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], structuredContent: r, isError: true }
      : asResult(r);
  },
);

await server.connect(new StdioServerTransport());
