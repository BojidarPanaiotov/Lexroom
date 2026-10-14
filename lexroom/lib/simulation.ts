import type { SimulationConfig } from "./config";

export type FindingTemplate = {
  clause: string | null;
  title: string;
  severity: string;
  excerpt: string | null;
  explanation: string;
};

export type SimulationOutcome = "success" | "failure" | "slow";

export type SimulationEvent =
  | { type: "finding"; atMs: number; sequence: number }
  | { type: "complete"; atMs: number }
  | { type: "fail"; atMs: number; message: string };

export type SimulationPlan = {
  outcome: SimulationOutcome;
  events: SimulationEvent[];
};

export type SimulationOverride = {
  outcome: SimulationOutcome;
  durationMs?: number;
  failAfterFindings?: number;
};

/** Returns a number in [0, 1). */
export type Rng = () => number;

export const SERVICE_FAILURE_MESSAGE =
  "The review service failed before it finished. Findings saved before the failure are incomplete and are not a final analysis.";

/**
 * Build the schedule the worker will follow.
 *
 * Outcomes are exclusive, so the rates add up:
 * - `slowRate` (default 1 in 10) schedule a completion attempt after the
 *   normal deadline. The deadline fails that review permanently.
 * - `failRate` (default 1 in 5) fail inside the normal 5–30s window, after
 *   a random number of findings (including none, and including all of them).
 * - the rest succeed and emit every finding before completing.
 *
 * Findings are spread across the run and the terminal event is last, so they
 * arrive one at a time rather than as a single batch at the end.
 */
export function createSimulationPlan(
  findings: FindingTemplate[],
  rng: Rng,
  config: SimulationConfig,
  override?: SimulationOverride,
): SimulationPlan {
  const outcome = override?.outcome ?? rollOutcome(rng, config);
  const count = findings.length;

  if (outcome === "slow") {
    const total = override?.durationMs ?? randomBetween(rng, config.slowMinMs, config.slowMaxMs);
    return { outcome, events: [...spreadFindings(count, total), { type: "complete", atMs: total }] };
  }

  if (outcome === "failure") {
    const total =
      override?.durationMs ?? randomBetween(rng, config.durationMinMs, config.durationMaxMs);
    const failAfter =
      override?.failAfterFindings ?? Math.floor(rng() * (count + 1));
    const emitted = Math.max(0, Math.min(count, failAfter));
    return {
      outcome,
      events: [
        ...spreadFindings(emitted, total),
        { type: "fail", atMs: total, message: SERVICE_FAILURE_MESSAGE },
      ],
    };
  }

  const total =
    override?.durationMs ?? randomBetween(rng, config.durationMinMs, config.durationMaxMs);
  return {
    outcome,
    events: [...spreadFindings(count, total), { type: "complete", atMs: total }],
  };
}

export function parseSimulationPlan(value: unknown): SimulationPlan | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { outcome?: unknown; events?: unknown };
  if (record.outcome !== "success" && record.outcome !== "failure" && record.outcome !== "slow") {
    return null;
  }
  if (!Array.isArray(record.events)) return null;

  const events: SimulationEvent[] = [];
  for (const event of record.events) {
    if (!event || typeof event !== "object") return null;
    const candidate = event as { type?: unknown; atMs?: unknown; sequence?: unknown; message?: unknown };
    if (typeof candidate.atMs !== "number" || !Number.isFinite(candidate.atMs)) return null;
    if (candidate.type === "finding") {
      if (typeof candidate.sequence !== "number" || !Number.isInteger(candidate.sequence)) return null;
      events.push({ type: "finding", atMs: candidate.atMs, sequence: candidate.sequence });
    } else if (candidate.type === "complete") {
      events.push({ type: "complete", atMs: candidate.atMs });
    } else if (candidate.type === "fail" && typeof candidate.message === "string") {
      events.push({ type: "fail", atMs: candidate.atMs, message: candidate.message });
    } else {
      return null;
    }
  }

  return { outcome: record.outcome, events };
}

function rollOutcome(rng: Rng, config: SimulationConfig): SimulationOutcome {
  const roll = rng();
  if (roll < config.slowRate) return "slow";
  if (roll < config.slowRate + config.failRate) return "failure";
  return "success";
}

function randomBetween(rng: Rng, min: number, max: number): number {
  return Math.round(min + rng() * (max - min));
}

function spreadFindings(count: number, totalMs: number): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  for (let sequence = 0; sequence < count; sequence += 1) {
    const slot = Math.round((totalMs * (sequence + 1)) / (count + 1));
    const atMs = totalMs <= 0 ? 0 : Math.min(Math.max(slot, 0), Math.max(totalMs - 1, 0));
    events.push({ type: "finding", atMs, sequence });
  }
  return events;
}

export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
