import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { getSimulationConfig, MONTHLY_REVIEW_LIMIT, TIMEZONE } from "./config";
import { ApiError } from "./errors";
import { deadlineFor, toLawyer, toRelation, toReview, toReviewSummary, toUsage } from "./present";
import { prisma } from "./prisma";
import {
  createSimulationPlan,
  parseSimulationPlan,
  type FindingTemplate,
  type SimulationOverride,
} from "./simulation";
import { formatDateTime, getMonthBounds, type MonthBounds } from "./time";
import type { DocumentDetailDTO, DocumentSummaryDTO, ReviewDTO, StartedReviewDTO, UsageDTO } from "./types";

type Db = PrismaClient | Prisma.TransactionClient;

const reviewWithFindings = {
  lawyer: true,
  findings: { orderBy: { sequence: "asc" as const } },
} satisfies Prisma.ReviewInclude;

const ACTIVE_STATUSES = ["pending", "running"] as const;

export function timeoutMessage(timeoutMs: number): string {
  const seconds = Math.round(timeoutMs / 1000);
  return `This review was still in progress ${seconds} seconds after it was requested, so it was marked as failed. Results that arrived after the deadline were ignored.`;
}

function quotaMessage(used: number, inProgress: number, resetsAt: Date): string {
  return `The shared monthly limit is ${MONTHLY_REVIEW_LIMIT} successful reviews. ${used} have completed and ${inProgress} are in progress, so there is no room to start another. Failed reviews do not count and release their place. This request was rejected and was not queued. The quota resets on ${formatDateTime(resetsAt)} (${TIMEZONE}).`;
}

function activeReviewMessage(lawyerName: string, requestedAt: Date): string {
  return `This document already has a review in progress, requested by ${lawyerName} on ${formatDateTime(requestedAt)}. Only one review can run on a document at a time. Wait for it to finish or fail.`;
}

function toPostgresInterval(timeoutMs: number) {
  return Prisma.sql`${timeoutMs} * INTERVAL '1 millisecond'`;
}

export async function databaseNow(client: Db = prisma): Promise<Date> {
  const rows = await client.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  const now = rows[0]?.now;
  if (!now) throw new Error("The database did not return a timestamp.");
  return now;
}

/**
 * Mark every review that is still open at its own deadline as failed.
 * The deadline is `requestedAt + timeout`, not the moment this statement runs.
 * Rows that are already completed or failed are left untouched.
 */
async function failTimedOutReviews(client: Db = prisma): Promise<number> {
  const timeoutMs = getSimulationConfig().timeoutMs;
  const message = timeoutMessage(timeoutMs);
  return client.$executeRaw`
    UPDATE "Review"
    SET
      status = 'failed'::"ReviewStatus",
      "failedAt" = "requestedAt" + ${toPostgresInterval(timeoutMs)},
      "errorMessage" = ${message},
      "failureCode" = 'timeout',
      "activeDocumentId" = NULL
    WHERE status IN ('pending'::"ReviewStatus", 'running'::"ReviewStatus")
      AND "requestedAt" + ${toPostgresInterval(timeoutMs)} <= clock_timestamp()
  `;
}

export async function startPendingReviews(client: Db = prisma): Promise<number> {
  const timeoutMs = getSimulationConfig().timeoutMs;
  return client.$executeRaw`
    UPDATE "Review"
    SET status = 'running'::"ReviewStatus"
    WHERE status = 'pending'::"ReviewStatus"
      AND "requestedAt" + ${toPostgresInterval(timeoutMs)} > clock_timestamp()
  `;
}

/**
 * Apply the guarded completion update used by the worker.
 * Returns the number of rows changed. A failed or overdue review stays as it is.
 */
export async function completeIfActive(reviewId: string, client: Db = prisma): Promise<number> {
  const timeoutMs = getSimulationConfig().timeoutMs;
  return client.$executeRaw`
    UPDATE "Review"
    SET
      status = 'completed'::"ReviewStatus",
      "completedAt" = clock_timestamp(),
      "activeDocumentId" = NULL
    WHERE id = ${reviewId}
      AND status IN ('pending'::"ReviewStatus", 'running'::"ReviewStatus")
      AND "requestedAt" + ${toPostgresInterval(timeoutMs)} > clock_timestamp()
  `;
}

async function failIfActive(
  reviewId: string,
  message: string,
  client: Db,
): Promise<number> {
  const timeoutMs = getSimulationConfig().timeoutMs;
  return client.$executeRaw`
    UPDATE "Review"
    SET
      status = 'failed'::"ReviewStatus",
      "failedAt" = clock_timestamp(),
      "errorMessage" = ${message},
      "failureCode" = 'service_error',
      "activeDocumentId" = NULL
    WHERE id = ${reviewId}
      AND status IN ('pending'::"ReviewStatus", 'running'::"ReviewStatus")
      AND "requestedAt" + ${toPostgresInterval(timeoutMs)} > clock_timestamp()
  `;
}

async function insertFindingIfActive(
  reviewId: string,
  sequence: number,
  template: FindingTemplate,
  client: Db,
): Promise<boolean> {
  const timeoutMs = getSimulationConfig().timeoutMs;
  const rows = await client.$queryRaw<{ id: string }[]>`
    INSERT INTO "Finding" (
      "id",
      "reviewId",
      "sequence",
      "clause",
      "title",
      "severity",
      "excerpt",
      "explanation",
      "createdAt"
    )
    SELECT
      ${randomUUID()},
      ${reviewId},
      ${sequence},
      ${template.clause},
      ${template.title},
      ${template.severity},
      ${template.excerpt},
      ${template.explanation},
      clock_timestamp()
    WHERE EXISTS (
      SELECT 1
      FROM "Review"
      WHERE "id" = ${reviewId}
        AND status IN ('pending'::"ReviewStatus", 'running'::"ReviewStatus")
        AND "requestedAt" + ${toPostgresInterval(timeoutMs)} > clock_timestamp()
    )
    ON CONFLICT ("reviewId", "sequence") DO NOTHING
    RETURNING "id"
  `;
  return rows.length > 0;
}

export function parseFindingTemplates(value: unknown): FindingTemplate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const finding = item as Partial<FindingTemplate>;
    if (typeof finding.title !== "string" || typeof finding.explanation !== "string") return [];
    if (typeof finding.severity !== "string") return [];
    return [
      {
        clause: typeof finding.clause === "string" ? finding.clause : null,
        title: finding.title,
        severity: finding.severity,
        excerpt: typeof finding.excerpt === "string" ? finding.excerpt : null,
        explanation: finding.explanation,
      },
    ];
  });
}

export async function applySimulatedReviews(client: Db = prisma): Promise<void> {
  const timeoutMs = getSimulationConfig().timeoutMs;
  const now = await databaseNow(client);
  const reviews = await client.review.findMany({
    where: { status: "running" },
    include: {
      findings: { select: { sequence: true } },
      document: { select: { expectedFindings: true } },
    },
  });

  for (const review of reviews) {
    const elapsed = now.getTime() - review.requestedAt.getTime();
    if (elapsed >= timeoutMs) continue;

    const plan = parseSimulationPlan(review.simulationPlan);
    if (!plan) {
      console.error(`[worker] review ${review.id} has an unreadable simulation plan`);
      continue;
    }

    const templates = parseFindingTemplates(review.document.expectedFindings);
    const seen = new Set(review.findings.map((finding) => finding.sequence));
    const events = [...plan.events].sort((left, right) => left.atMs - right.atMs);

    for (const event of events) {
      if (event.atMs > elapsed) break;

      if (event.type === "finding") {
        if (seen.has(event.sequence)) continue;
        const template = templates[event.sequence];
        if (!template) {
          console.error(`[worker] review ${review.id} is missing finding ${event.sequence}`);
          break;
        }
        const inserted = await insertFindingIfActive(review.id, event.sequence, template, client);
        if (!inserted) {
          const existing = await client.finding.findUnique({
            where: { reviewId_sequence: { reviewId: review.id, sequence: event.sequence } },
            select: { id: true },
          });
          if (!existing) break;
        } else {
          console.log(`[worker] review ${review.id} saved finding ${event.sequence + 1}`);
        }
        seen.add(event.sequence);
        continue;
      }

      if (event.type === "complete") {
        const updated = await completeIfActive(review.id, client);
        if (updated === 1) {
          console.log(`[worker] review ${review.id} completed`);
        }
        break;
      }

      const updated = await failIfActive(review.id, event.message, client);
      if (updated === 1) {
        console.log(`[worker] review ${review.id} failed`);
      }
      break;
    }
  }
}

export async function tick(): Promise<void> {
  const expired = await failTimedOutReviews();
  if (expired > 0) {
    console.log(`[worker] marked ${expired} overdue review(s) as failed`);
  }
  const claimed = await startPendingReviews();
  if (claimed > 0) {
    console.log(`[worker] started ${claimed} review(s)`);
  }
  await applySimulatedReviews();
}

async function countUsage(
  client: Db,
  bounds: MonthBounds,
): Promise<{ used: number; inProgress: number }> {
  const used = await client.review.count({
    where: {
      status: "completed",
      requestedAt: { gte: bounds.start, lt: bounds.end },
    },
  });
  const inProgress = await client.review.count({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      requestedAt: { gte: bounds.start, lt: bounds.end },
    },
  });
  return { used, inProgress };
}

export async function getUsage(): Promise<UsageDTO> {
  await failTimedOutReviews ();
  const bounds = getMonthBounds(await databaseNow());
  return toUsage(await countUsage(prisma, bounds), bounds);
}

function isActiveReviewConstraint(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return true;
  }
  return error instanceof Error && error.message.includes("Review_one_active_per_document");
}

export async function startReview(input: {
  documentId: string;
  lawyerId: string;
  simulation?: SimulationOverride;
}): Promise<StartedReviewDTO> {
  await failTimedOutReviews ();
  const timeoutMs = getSimulationConfig().timeoutMs;

  try {
    const review = await prisma.$transaction(
      async (tx) => {
        // Serialises quota checks so two lawyers cannot both take the last place.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(872341, 1)`;
        await failTimedOutReviews (tx);

        const lawyer = await tx.lawyer.findUnique({ where: { id: input.lawyerId } });
        if (!lawyer) {
          throw new ApiError(400, "UNKNOWN_LAWYER", "That lawyer is not part of this workspace.");
        }

        const document = await tx.document.findUnique({ where: { id: input.documentId } });
        if (!document) {
          throw new ApiError(404, "NOT_FOUND", "Document not found.");
        }

        const bounds = getMonthBounds(await databaseNow(tx));
        const usage = await countUsage(tx, bounds);
        if (usage.used + usage.inProgress >= MONTHLY_REVIEW_LIMIT) {
          throw new ApiError(429, "QUOTA_EXCEEDED", quotaMessage(usage.used, usage.inProgress, bounds.end), {
            usage: toUsage(usage, bounds),
          });
        }

        const active = await tx.review.findFirst({
          where: { documentId: document.id, status: { in: [...ACTIVE_STATUSES] } },
          include: { lawyer: true },
        });
        if (active) {
          throw new ApiError(409, "REVIEW_IN_PROGRESS", activeReviewMessage(active.lawyer.name, active.requestedAt), {
            activeReview: {
              id: active.id,
              requestedAt: active.requestedAt.toISOString(),
              lawyer: toLawyer(active.lawyer),
            },
          });
        }

        const plan = createSimulationPlan(
          parseFindingTemplates(document.expectedFindings),
          Math.random,
          getSimulationConfig(),
          input.simulation,
        );

        return tx.review.create({
          data: {
            documentId: document.id,
            lawyerId: lawyer.id,
            status: "pending",
            activeDocumentId: document.id,
            simulationPlan: plan as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 20_000, maxWait: 10_000 },
    );

    return {
      id: review.id,
      documentId: review.documentId,
      status: review.status,
      requestedAt: review.requestedAt.toISOString(),
      deadlineAt: deadlineFor(review.requestedAt, timeoutMs).toISOString(),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (!isActiveReviewConstraint(error)) throw error;

    const active = await prisma.review.findFirst({
      where: { documentId: input.documentId, status: { in: [...ACTIVE_STATUSES] } },
      include: { lawyer: true },
    });
    if (!active) throw error;
    throw new ApiError(409, "REVIEW_IN_PROGRESS", activeReviewMessage(active.lawyer.name, active.requestedAt), {
      activeReview: {
        id: active.id,
        requestedAt: active.requestedAt.toISOString(),
        lawyer: toLawyer(active.lawyer),
      },
    });
  }
}

const documentInclude = {
  uploadedBy: true,
  supersedes: { select: { id: true, title: true } },
  supersededBy: { select: { id: true, title: true }, take: 1 },
  reviews: {
    orderBy: { requestedAt: "desc" as const },
    include: {
      lawyer: true,
      _count: { select: { findings: true } },
    },
  },
} satisfies Prisma.DocumentInclude;

type ListedDocument = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

function toDocumentSummary(document: ListedDocument): DocumentSummaryDTO {
  const latest = document.reviews[0] ?? null;
  const latestCompleted = document.reviews.find((review) => review.status === "completed") ?? null;
  return {
    id: document.id,
    title: document.title,
    type: document.type,
    pages: document.pages,
    uploadedAt: document.uploadedAt.toISOString(),
    uploadedBy: toLawyer(document.uploadedBy),
    supersedes: toRelation(document.supersedes),
    supersededBy: toRelation(document.supersededBy[0] ?? null),
    latestReview: latest ? toReviewSummary(latest) : null,
    latestCompletedReview: latestCompleted ? toReviewSummary(latestCompleted) : null,
  };
}

export async function listLawyers() {
  const lawyers = await prisma.lawyer.findMany({ orderBy: { name: "asc" } });
  return lawyers.map(toLawyer);
}

export async function getDocuments(): Promise<DocumentSummaryDTO[]> {
  await failTimedOutReviews ();
  const documents = await prisma.document.findMany({
    orderBy: { uploadedAt: "desc" },
    include: documentInclude,
  });
  return documents.map(toDocumentSummary);
}

export async function getDocument(id: string): Promise<DocumentDetailDTO | null> {
  await failTimedOutReviews ();
  const document = await prisma.document.findUnique({
    where: { id },
    include: documentInclude,
  });
  if (!document) return null;

  const reviews = await prisma.review.findMany({
    where: { documentId: id },
    orderBy: { requestedAt: "desc" },
    include: reviewWithFindings,
  });

  return {
    ...toDocumentSummary(document),
    reviews: reviews.map(toReview),
  };
}

/** Deletes every review. Findings are removed with them. Lawyers and documents stay. */
export async function resetReviews(): Promise<{ deleted: number; usage: UsageDTO }> {
  const deleted = await prisma.review.deleteMany();
  return { deleted: deleted.count, usage: await getUsage() };
}

export async function getReview(id: string): Promise<ReviewDTO | null> {
  await failTimedOutReviews ();
  const review = await prisma.review.findUnique({
    where: { id },
    include: reviewWithFindings,
  });
  if (!review) return null;
  return toReview(review);
}
