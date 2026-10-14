import type { Finding, Lawyer, Review } from "@prisma/client";
import { getSimulationConfig, MONTHLY_REVIEW_LIMIT, TIMEZONE } from "./config";
import { addMilliseconds, type MonthBounds } from "./time";
import type {
  DocumentRelationDTO,
  FailureCode,
  FindingDTO,
  FindingsLabel,
  LawyerDTO,
  ReviewDTO,
  ReviewStatus,
  ReviewSummaryDTO,
  UsageDTO,
} from "./types";

export function toLawyer(lawyer: Lawyer): LawyerDTO {
  return { id: lawyer.id, name: lawyer.name, title: lawyer.title };
}

export function toRelation(document: { id: string; title: string } | null): DocumentRelationDTO | null {
  if (!document) return null;
  return { id: document.id, title: document.title };
}

export function findingsLabelFor(status: ReviewStatus): FindingsLabel {
  if (status === "completed") return "final";
  if (status === "failed") return "incomplete";
  return "partial";
}

export function deadlineFor(requestedAt: Date, timeoutMs = getSimulationConfig().timeoutMs): Date {
  return addMilliseconds(requestedAt, timeoutMs);
}

function asStatus(status: Review["status"]): ReviewStatus {
  return status;
}

function asFailureCode(value: string | null): FailureCode | null {
  if (value === "timeout" || value === "service_error") return value;
  return null;
}

export function toFinding(finding: Finding): FindingDTO {
  return {
    id: finding.id,
    sequence: finding.sequence,
    clause: finding.clause,
    title: finding.title,
    severity: finding.severity,
    excerpt: finding.excerpt,
    explanation: finding.explanation,
    createdAt: finding.createdAt.toISOString(),
  };
}

type ReviewWithLawyer = Review & { lawyer: Lawyer };

export function toReviewSummary(
  review: ReviewWithLawyer & { _count: { findings: number } },
): ReviewSummaryDTO {
  return {
    id: review.id,
    status: asStatus(review.status),
    requestedAt: review.requestedAt.toISOString(),
    completedAt: review.completedAt?.toISOString() ?? null,
    failedAt: review.failedAt?.toISOString() ?? null,
    deadlineAt: deadlineFor(review.requestedAt).toISOString(),
    errorMessage: review.errorMessage,
    failureCode: asFailureCode(review.failureCode),
    lawyer: toLawyer(review.lawyer),
    findingCount: review._count.findings,
  };
}

export function toReview(review: ReviewWithLawyer & { findings: Finding[] }): ReviewDTO {
  const findings = [...review.findings].sort((a, b) => a.sequence - b.sequence);
  return {
    id: review.id,
    documentId: review.documentId,
    status: asStatus(review.status),
    requestedAt: review.requestedAt.toISOString(),
    completedAt: review.completedAt?.toISOString() ?? null,
    failedAt: review.failedAt?.toISOString() ?? null,
    deadlineAt: deadlineFor(review.requestedAt).toISOString(),
    errorMessage: review.errorMessage,
    failureCode: asFailureCode(review.failureCode),
    lawyer: toLawyer(review.lawyer),
    findings: findings.map(toFinding),
    findingsLabel: findingsLabelFor(asStatus(review.status)),
  };
}

export function toUsage(
  counts: { used: number; inProgress: number },
  bounds: MonthBounds,
): UsageDTO {
  const remaining = Math.max(0, MONTHLY_REVIEW_LIMIT - counts.used - counts.inProgress);
  return {
    used: counts.used,
    inProgress: counts.inProgress,
    limit: MONTHLY_REVIEW_LIMIT,
    remaining,
    resetsAt: bounds.end.toISOString(),
    timezone: TIMEZONE,
    month: bounds.monthKey,
  };
}
