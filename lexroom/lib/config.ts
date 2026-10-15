/**
 * Workspace rules that are shared by the API and the worker.
 *
 * Calendar months use Europe/Rome, the firm's timezone (CET/CEST).
 * A review belongs to the month of its persisted request timestamp.
 */

export const TIMEZONE = "Europe/Rome";

export const MONTHLY_REVIEW_LIMIT = 10;

export type SimulationConfig = {
  failRate: number;
  slowRate: number;
  durationMinMs: number;
  durationMaxMs: number;
  slowMinMs: number;
  slowMaxMs: number;
  timeoutMs: number;
};

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number, received "${raw}".`);
  }
  return value;
}

export function getSimulationConfig(): SimulationConfig {
  const config: SimulationConfig = {
    failRate: readNumber("REVIEW_FAIL_RATE", 0.2),
    slowRate: readNumber("REVIEW_SLOW_RATE", 0.1),
    durationMinMs: readNumber("REVIEW_DURATION_MIN_MS", 5_000),
    durationMaxMs: readNumber("REVIEW_DURATION_MAX_MS", 30_000),
    slowMinMs: readNumber("REVIEW_SLOW_MIN_MS", 60_000),
    slowMaxMs: readNumber("REVIEW_SLOW_MAX_MS", 120_000),
    timeoutMs: readNumber("REVIEW_TIMEOUT_MS", 60_000),
  };

  if (config.failRate < 0 || config.failRate > 1) {
    throw new Error("REVIEW_FAIL_RATE must be between 0 and 1.");
  }
  if (config.slowRate < 0 || config.slowRate > 1) {
    throw new Error("REVIEW_SLOW_RATE must be between 0 and 1.");
  }
  if (config.failRate + config.slowRate > 1) {
    throw new Error("REVIEW_FAIL_RATE + REVIEW_SLOW_RATE must be at most 1.");
  }
  if (config.durationMinMs < 0 || config.durationMaxMs < config.durationMinMs) {
    throw new Error("Review duration bounds are invalid.");
  }
  if (config.slowMinMs < 0 || config.slowMaxMs < config.slowMinMs) {
    throw new Error("Slow review duration bounds are invalid.");
  }
  if (config.timeoutMs <= 0) {
    throw new Error("REVIEW_TIMEOUT_MS must be greater than 0.");
  }

  return config;
}
