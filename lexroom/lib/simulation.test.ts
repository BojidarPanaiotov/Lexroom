import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSimulationConfig } from "./config";
import {
  createSimulationPlan,
  mulberry32,
  SERVICE_FAILURE_MESSAGE,
  type FindingTemplate,
} from "./simulation";

const findings: FindingTemplate[] = [
  {
    clause: "1",
    title: "One",
    severity: "high",
    excerpt: "Excerpt",
    explanation: "Because.",
  },
  {
    clause: null,
    title: "Two",
    severity: "low",
    excerpt: null,
    explanation: "Also because.",
  },
  {
    clause: "3",
    title: "Three",
    severity: "medium",
    excerpt: null,
    explanation: "Third.",
  },
];

const config = getSimulationConfig();

describe("createSimulationPlan", () => {
  it("splits outcomes into about 1 in 10 slow, 1 in 5 failed, and the rest successful", () => {
    const rng = mulberry32(20261014);
    const counts = { success: 0, failure: 0, slow: 0 };
    const samples = 4000;
    for (let i = 0; i < samples; i += 1) {
      counts[createSimulationPlan(findings, rng, config).outcome] += 1;
    }
    assert.ok(Math.abs(counts.slow / samples - 0.1) < 0.03);
    assert.ok(Math.abs(counts.failure / samples - 0.2) < 0.03);
    assert.ok(Math.abs(counts.success / samples - 0.7) < 0.03);
  });

  it("schedules a normal success across 5–30 seconds, findings before completion", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i += 1) {
      const plan = createSimulationPlan(findings, rng, config, { outcome: "success" });
      const last = plan.events[plan.events.length - 1];
      assert.equal(last?.type, "complete");
      if (last?.type !== "complete") continue;
      assert.ok(last.atMs >= 5_000 && last.atMs <= 30_000);
      const findingEvents = plan.events.filter((event) => event.type === "finding");
      assert.equal(findingEvents.length, findings.length);
      for (const event of findingEvents) {
        assert.ok(event.atMs < last.atMs);
      }
    }
  });

  it("can fail after no findings or after some findings, inside the normal window", () => {
    const none = createSimulationPlan(findings, mulberry32(1), config, {
      outcome: "failure",
      failAfterFindings: 0,
      durationMs: 8_000,
    });
    assert.deepEqual(none.events, [
      { type: "fail", atMs: 8_000, message: SERVICE_FAILURE_MESSAGE },
    ]);

    const partial = createSimulationPlan(findings, mulberry32(1), config, {
      outcome: "failure",
      failAfterFindings: 1,
      durationMs: 9_000,
    });
    assert.equal(partial.events.filter((event) => event.type === "finding").length, 1);
    assert.equal(partial.events.at(-1)?.type, "fail");
  });

  it("schedules slow reviews to attempt completion only after 60 seconds", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 30; i += 1) {
      const plan = createSimulationPlan(findings, rng, config, { outcome: "slow" });
      const last = plan.events.at(-1);
      assert.equal(last?.type, "complete");
      if (last?.type !== "complete") continue;
      assert.ok(last.atMs >= 60_000 && last.atMs <= 120_000);
    }
  });

  it("honours an explicit short duration so the deadline can be tested without waiting", () => {
    const plan = createSimulationPlan([], () => 0, config, {
      outcome: "success",
      durationMs: 250,
    });
    assert.deepEqual(plan.events, [{ type: "complete", atMs: 250 }]);
  });
});
