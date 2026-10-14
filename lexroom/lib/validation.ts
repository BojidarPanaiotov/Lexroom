import type { SimulationOutcome, SimulationOverride } from "./simulation";
import { ApiError } from "./errors";

const OUTCOMES = new Set<SimulationOutcome>(["success", "failure", "slow"]);

export function parseStartReviewBody(body: unknown): {
  lawyerId: string;
  simulation?: SimulationOverride;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "VALIDATION", "Request body must be a JSON object.");
  }

  const record = body as {
    lawyerId?: unknown;
    simulation?: unknown;
  };

  if (typeof record.lawyerId !== "string" || record.lawyerId.trim() === "") {
    throw new ApiError(400, "VALIDATION", "lawyerId is required.");
  }

  if (record.simulation === undefined) {
    return { lawyerId: record.lawyerId.trim() };
  }

  if (!record.simulation || typeof record.simulation !== "object" || Array.isArray(record.simulation)) {
    throw new ApiError(400, "VALIDATION", "simulation must be an object.");
  }

  const simulation = record.simulation as {
    outcome?: unknown;
    durationMs?: unknown;
    failAfterFindings?: number;
  };

  if (typeof simulation.outcome !== "string" || !OUTCOMES.has(simulation.outcome as SimulationOutcome)) {
    throw new ApiError(
      400,
      "VALIDATION",
      "simulation.outcome must be success, failure, or slow.",
    );
  }

  const override: SimulationOverride = {
    outcome: simulation.outcome as SimulationOutcome,
  };

  if (simulation.durationMs !== undefined) {
    if (
      typeof simulation.durationMs !== "number" ||
      !Number.isInteger(simulation.durationMs) ||
      simulation.durationMs < 0 ||
      simulation.durationMs > 300_000
    ) {
      throw new ApiError(
        400,
        "VALIDATION",
        "simulation.durationMs must be an integer from 0 to 300000.",
      );
    }
    override.durationMs = simulation.durationMs;
  }

  if (simulation.failAfterFindings !== undefined) {
    if (
      typeof simulation.failAfterFindings !== "number" ||
      !Number.isInteger(simulation.failAfterFindings) ||
      simulation.failAfterFindings < 0
    ) {
      throw new ApiError(
        400,
        "VALIDATION",
        "simulation.failAfterFindings must be an integer of 0 or more.",
      );
    }
    override.failAfterFindings = simulation.failAfterFindings;
  }

  return { lawyerId: record.lawyerId.trim(), simulation: override };
}
