// Types for the shared eval-detector module. The implementation is plain JS
// (eval-detector.js) so the zero-dep CLI can run it under Node directly; this
// declaration lets the server (src/lib/verify.ts) import the scoring half with
// full typing.

export type EvalSignals = {
  eval_files_created: number;
  eval_frameworks_detected: string[];
  eval_run_count: number;
  eval_iteration_cycles: number;
  pass_rate_delta: number | null;
  workflows_with_evals: number;
};

export type EvalCaps = { eval_files_created: number; eval_iteration_cycles: number };
export type EvalWeights = {
  perFile: number;
  perCycle: number;
  passBonusMax: number;
  perExtraWorkflow: number;
};

export const EVAL_FILE_PATTERNS: RegExp[];
export const RUN_COMMAND_PATTERNS: RegExp[];
export const DEFAULT_CAPS: EvalCaps;
export const DEFAULT_WEIGHTS: EvalWeights;

export function parseSessionLog(jsonl: string): Array<Record<string, unknown>>;
export function parsePassFail(text: string): { passed: number; failed: number } | null;
export function detectEvals(jsonl: string, opts?: { caps?: EvalCaps }): EvalSignals;
export function isScoreEligible(evals: EvalSignals): boolean;
export function scoreEvals(evals: EvalSignals, weights?: EvalWeights): number;
