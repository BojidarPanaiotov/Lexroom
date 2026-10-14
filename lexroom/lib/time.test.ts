import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMonthBounds, getZonedParts } from "./time";

describe("Europe/Rome month boundaries", () => {
  it("places 14 October 2026 in October, from 1 Oct CEST through 1 Nov CET", () => {
    const bounds = getMonthBounds(new Date("2026-10-14T10:00:00.000Z"));
    assert.equal(bounds.monthKey, "2026-10");
    // 1 Oct 2026 00:00 in Rome is CEST (UTC+2).
    assert.equal(bounds.start.toISOString(), "2026-09-30T22:00:00.000Z");
    // 1 Nov 2026 00:00 in Rome is CET (UTC+1), after the clocks go back.
    assert.equal(bounds.end.toISOString(), "2026-10-31T23:00:00.000Z");
  });

  it("treats the last instant of October as October and the reset instant as November", () => {
    const beforeReset = getMonthBounds(new Date("2026-10-31T22:59:59.000Z"));
    assert.equal(beforeReset.monthKey, "2026-10");

    const atReset = getMonthBounds(new Date("2026-10-31T23:00:00.000Z"));
    assert.equal(atReset.monthKey, "2026-11");
    assert.equal(atReset.start.toISOString(), "2026-10-31T23:00:00.000Z");
    assert.equal(atReset.end.toISOString(), "2026-11-30T23:00:00.000Z");
  });

  it("keeps a review requested in the last minute of the month in that month", () => {
    // 31 Oct 2026 23:59 Rome = 22:59 UTC.
    const bounds = getMonthBounds(new Date("2026-10-31T22:59:50.000Z"));
    assert.equal(bounds.monthKey, "2026-10");
  });

  it("reads Rome wall time across the October DST change", () => {
    // Clocks go back at 03:00 CEST on 25 Oct 2026, which is 01:00 UTC.
    const before = getZonedParts(new Date("2026-10-25T00:30:00.000Z"), "Europe/Rome");
    assert.equal(before.hour, 2);
    assert.equal(before.day, 25);

    const after = getZonedParts(new Date("2026-10-25T01:30:00.000Z"), "Europe/Rome");
    assert.equal(after.hour, 2);
    assert.equal(after.day, 25);
  });
});
