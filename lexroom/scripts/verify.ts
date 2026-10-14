import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import {
  completeIfActive,
  getReview,
  getUsage,
  startReview,
  tick,
} from "../lib/reviews";

type SampleDocument = {
  id: string;
  findings: Array<{
    clause: string | null;
    title: string;
    severity: string;
    excerpt: string | null;
    explanation: string;
  }>;
};

const samples = JSON.parse(
  readFileSync(path.join(process.cwd(), "samples", "documents.json"), "utf8"),
) as SampleDocument[];

async function resetReviews(): Promise<void> {
  await prisma.finding.deleteMany();
  await prisma.review.deleteMany();
}

function assertApiError(error: unknown, code: ApiError["code"]): asserts error is ApiError {
  assert.ok(error instanceof ApiError, `expected ${code}, received ${String(error)}`);
  assert.equal(error.code, code);
}

async function main(): Promise<void> {
  const lawyers = await prisma.lawyer.findMany({ orderBy: { name: "asc" } });
  const documents = await prisma.document.findMany({ orderBy: { uploadedAt: "asc" } });
  assert.equal(lawyers.length, 3);
  assert.equal(documents.length, samples.length);
  const lawyer = lawyers[0];
  const otherLawyer = lawyers[1];
  if (!lawyer || !otherLawyer) throw new Error("Expected three lawyers.");

  await resetReviews();

  const sharedDocument = documents[0];
  if (!sharedDocument) throw new Error("Expected a document.");
  const concurrent = await Promise.all(
    [lawyer, otherLawyer].map(async (person) => {
      try {
        const review = await startReview({
          documentId: sharedDocument.id,
          lawyerId: person.id,
          simulation: { outcome: "success", durationMs: 60_000 },
        });
        return { ok: true as const, id: review.id };
      } catch (error) {
        return { ok: false as const, error };
      }
    }),
  );
  const started = concurrent.filter((result) => result.ok);
  const blocked = concurrent.filter((result) => !result.ok);
  assert.equal(started.length, 1);
  assert.equal(blocked.length, 1);
  assertApiError(blocked[0]?.error, "REVIEW_IN_PROGRESS");
  assert.match(blocked[0]?.error.message ?? "", /already has a review in progress/);

  await resetReviews();

  const quotaResults = await Promise.all(
    documents.map(async (document) => {
      try {
        const review = await startReview({
          documentId: document.id,
          lawyerId: lawyer.id,
          simulation: { outcome: "success", durationMs: 60_000 },
        });
        return { ok: true as const, documentId: document.id, id: review.id };
      } catch (error) {
        return { ok: false as const, documentId: document.id, error };
      }
    }),
  );
  const accepted = quotaResults.filter((result) => result.ok);
  const rejected = quotaResults.filter((result) => !result.ok);
  assert.equal(accepted.length, 10);
  assert.equal(rejected.length, documents.length - 10);
  for (const result of rejected) {
    assertApiError(result.error, "QUOTA_EXCEEDED");
    assert.equal(result.error.status, 429);
    assert.match(result.error.message, /not queued/);
    assert.equal(result.error.details?.usage?.limit, 10);
    assert.ok(result.error.details?.usage?.resetsAt);
  }
  const full = await getUsage();
  assert.equal(full.used, 0);
  assert.equal(full.inProgress, 10);
  assert.equal(full.remaining, 0);
  assert.equal(full.timezone, "Europe/Rome");

  const held = accepted[0];
  const waiting = rejected[0];
  if (!held || !waiting) throw new Error("Expected both an accepted and a rejected request.");
  await prisma.$executeRaw`
    UPDATE "Review"
    SET "requestedAt" = clock_timestamp() - interval '61 seconds'
    WHERE id = ${held.id}
  `;
  await tick();
  const timedOut = await getReview(held.id);
  assert.equal(timedOut?.status, "failed");
  assert.equal(timedOut?.failureCode, "timeout");
  const afterRelease = await getUsage();
  assert.equal(afterRelease.inProgress, 9);
  assert.equal(afterRelease.remaining, 1);
  const resumed = await startReview({
    documentId: waiting.documentId,
    lawyerId: otherLawyer.id,
    simulation: { outcome: "failure", durationMs: 60_000 },
  });
  assert.notEqual(resumed.id, held.id);

  await resetReviews();

  const nda = samples.find((document) => document.findings.length === 3 && document.id === documents.find((item) => item.title.includes("Non-disclosure"))?.id);
  const ndaDocument = documents.find((document) => document.title.includes("Non-disclosure"));
  const emptyDocument = documents.find((document) => document.title.includes("Consulting agreement"));
  if (!nda || !ndaDocument || !emptyDocument) throw new Error("Sample documents were not seeded.");

  const successful = await startReview({
    documentId: ndaDocument.id,
    lawyerId: lawyer.id,
    simulation: { outcome: "success", durationMs: 0 },
  });
  await tick();
  const completed = await getReview(successful.id);
  assert.equal(completed?.status, "completed");
  assert.equal(completed?.findingsLabel, "final");
  assert.equal(completed?.findings.length, nda.findings.length);
  nda.findings.forEach((expected, index) => {
    const actual = completed?.findings[index];
    assert.equal(actual?.clause, expected.clause);
    assert.equal(actual?.title, expected.title);
    assert.equal(actual?.severity, expected.severity);
    assert.equal(actual?.excerpt, expected.excerpt);
    assert.equal(actual?.explanation, expected.explanation);
    assert.equal(actual?.sequence, index);
  });
  assert.equal((await getUsage()).used, 1);

  await prisma.$executeRaw`
    UPDATE "Review"
    SET "requestedAt" = clock_timestamp() - interval '40 days'
    WHERE id = ${successful.id}
  `;
  assert.equal((await getUsage()).used, 0);

  await resetReviews();

  const failedRun = await startReview({
    documentId: ndaDocument.id,
    lawyerId: lawyer.id,
    simulation: { outcome: "failure", durationMs: 0, failAfterFindings: 1 },
  });
  await tick();
  const failed = await getReview(failedRun.id);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.failureCode, "service_error");
  assert.equal(failed?.findingsLabel, "incomplete");
  assert.equal(failed?.findings.length, 1);
  assert.equal(failed?.findings[0]?.title, nda.findings[0]?.title);
  assert.equal((await getUsage()).used, 0);

  const retry = await startReview({
    documentId: ndaDocument.id,
    lawyerId: otherLawyer.id,
    simulation: { outcome: "success", durationMs: 60_000 },
  });
  assert.notEqual(retry.id, failedRun.id);
  const history = await prisma.review.count({ where: { documentId: ndaDocument.id } });
  assert.equal(history, 2);

  await resetReviews();

  const slow = await startReview({
    documentId: ndaDocument.id,
    lawyerId: lawyer.id,
    simulation: { outcome: "success", durationMs: 120_000 },
  });
  await prisma.review.update({
    where: { id: slow.id },
    data: {
      simulationPlan: {
        outcome: "success",
        events: [
          { type: "finding", atMs: 0, sequence: 0 },
          { type: "complete", atMs: 120_000 },
        ],
      },
    },
  });
  await tick();
  const partial = await getReview(slow.id);
  assert.equal(partial?.status, "running");
  assert.equal(partial?.findingsLabel, "partial");
  assert.equal(partial?.findings.length, 1);

  await prisma.$executeRaw`
    UPDATE "Review"
    SET "requestedAt" = clock_timestamp() - interval '61 seconds'
    WHERE id = ${slow.id}
  `;
  await tick();
  const expired = await getReview(slow.id);
  assert.equal(expired?.status, "failed");
  assert.equal(expired?.failureCode, "timeout");
  assert.equal(expired?.findingsLabel, "incomplete");
  assert.equal(expired?.findings.length, 1);
  assert.equal(await completeIfActive(slow.id), 0);
  assert.equal((await getReview(slow.id))?.status, "failed");
  await assert.rejects(() =>
    prisma.finding.create({
      data: {
        reviewId: slow.id,
        sequence: 1,
        title: "Late finding",
        severity: "low",
        explanation: "This arrived after the review had already failed.",
      },
    }),
  );
  await assert.rejects(() =>
    prisma.review.update({
      where: { id: slow.id },
      data: { status: "completed" },
    }),
  );
  assert.equal((await getUsage()).used, 0);

  await resetReviews();

  await prisma.review.create({
    data: {
      documentId: emptyDocument.id,
      lawyerId: lawyer.id,
      status: "pending",
      activeDocumentId: emptyDocument.id,
      simulationPlan: { outcome: "success", events: [] },
    },
  });
  await assert.rejects(() =>
    prisma.review.create({
      data: {
        documentId: emptyDocument.id,
        lawyerId: otherLawyer.id,
        status: "pending",
        activeDocumentId: emptyDocument.id,
        simulationPlan: { outcome: "success", events: [] },
      },
    }),
  );

  await resetReviews();

  const empty = await startReview({
    documentId: emptyDocument.id,
    lawyerId: lawyer.id,
    simulation: { outcome: "success", durationMs: 0 },
  });
  await tick();
  const emptyReview = await getReview(empty.id);
  assert.equal(emptyReview?.status, "completed");
  assert.equal(emptyReview?.findings.length, 0);
  assert.equal(emptyReview?.findingsLabel, "final");

  await resetReviews();
  console.log("Verified quota, concurrency, timeout, retry, and findings.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
