"use client";

import Link from "next/link";
import { useState } from "react";
import { documentTypeLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import type { ApiErrorBody, DocumentDetailDTO, ReviewDTO } from "@/lib/types";
import { FindingList } from "./findings";
import { ReviewCard } from "./review-card";
import { useWorkspace } from "./shell";
import { StatusBadge } from "./status-badge";
import { POLL_MS, usePolling } from "./use-polling";

export function DocumentScreen({ id }: { id: string }) {
  const query = usePolling<{ document: DocumentDetailDTO }>(`/api/documents/${id}`, POLL_MS);
  const { lawyer, lawyerId, usage, ready } = useWorkspace();
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<ApiErrorBody | null>(null);
  const document = query.data?.document;

  async function requestReview() {
    if (!lawyerId) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/documents/${id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lawyerId }),
      });
      const body = (await response.json().catch(() => null)) as ApiErrorBody | { id?: string } | null;
      if (!response.ok) {
        setActionError(
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? (body as ApiErrorBody)
            : { error: "The review could not be started.", code: "INTERNAL" },
        );
      }
    } catch {
      setActionError({ error: "The request could not be sent.", code: "INTERNAL" });
    } finally {
      setSubmitting(false);
      await query.reload();
    }
  }

  if (query.loading && !document) {
    return <p className="text-sm text-muted">Loading document…</p>;
  }

  if (!document) {
    return (
      <div>
        <Link href="/" className="text-sm font-medium text-navy underline-offset-4 hover:underline">
          Back to workspace
        </Link>
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          {query.error ?? "Document not found."}
        </p>
      </div>
    );
  }

  const latest = document.reviews[0] ?? null;
  // The previous success stays on screen only while a newer attempt is still
  // running or has failed. Once the newest review itself completes, that
  // result is the one on screen and older successes stay in the history.
  const previousCompleted =
    latest && latest.status !== "completed"
      ? (document.reviews.find((review) => review.status === "completed") ?? null)
      : null;
  const active = latest?.status === "pending" || latest?.status === "running";
  const quotaBlocked = usage !== null && usage.remaining === 0;
  const buttonLabel = !latest
    ? "Request review"
    : latest.status === "failed"
      ? "Retry review"
      : latest.status === "completed"
        ? "Request a new review"
        : "Review in progress";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm font-medium text-navy underline-offset-4 hover:underline">
          Back to workspace
        </Link>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">
          {documentTypeLabel(document.type)} · {document.pages}{" "}
          {document.pages === 1 ? "page" : "pages"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{document.title}</h1>
        <p className="mt-2 text-sm text-muted">
          Uploaded {formatDateTime(new Date(document.uploadedAt))} by {document.uploadedBy.name},{" "}
          {document.uploadedBy.title}.
        </p>
        {document.supersedes && (
          <p className="mt-1 text-sm">
            Replaces{" "}
            <Link className="text-navy underline-offset-4 hover:underline" href={`/documents/${document.supersedes.id}`}>
              {document.supersedes.title}
            </Link>
            .
          </p>
        )}
        {document.supersededBy && (
          <p className="mt-1 text-sm">
            Superseded by{" "}
            <Link
              className="text-navy underline-offset-4 hover:underline"
              href={`/documents/${document.supersededBy.id}`}
            >
              {document.supersededBy.title}
            </Link>
            .
          </p>
        )}
      </div>

      {query.error && (
        <p className="text-sm text-rose-800" role="status">
          Latest refresh failed. Showing the last loaded review. {query.error}
        </p>
      )}

      <div className="rounded-xl border border-line bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted">
            {lawyer
              ? `A review started now is recorded as requested by ${lawyer.name}.`
              : "Select a lawyer before requesting a review."}
          </div>
          <button
            type="button"
            className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-300"
            onClick={() => void requestReview()}
            disabled={!ready || !lawyerId || submitting || active}
          >
            {submitting ? "Requesting…" : buttonLabel}
          </button>
        </div>
        {active && latest && (
          <p className="mt-3 text-sm text-muted">
            {latest.lawyer.name} requested the review that is running now. Another request has to
            wait until it finishes or fails.
          </p>
        )}
        {quotaBlocked && usage && (
          <p className="mt-3 text-sm text-amber-950">
            {usage.used} / {usage.limit} reviews used
            {usage.inProgress > 0 ? ` and ${usage.inProgress} in progress` : ""}. New requests are
            rejected until {formatDateTime(new Date(usage.resetsAt))} ({usage.timezone}). They are
            not queued.
          </p>
        )}
        {actionError && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-950" role="alert">
            <p>{actionError.error}</p>
            {actionError.usage && (
              <p className="mt-1">
                {actionError.usage.used} / {actionError.usage.limit} reviews used. Resets{" "}
                {formatDateTime(new Date(actionError.usage.resetsAt))} ({actionError.usage.timezone}).
              </p>
            )}
          </div>
        )}
      </div>

      {!latest && (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-sm text-muted">
          No reviews yet. Request one to start the simulated analysis.
        </p>
      )}

      {latest && (
        <ReviewCard
          review={latest}
          heading={
            latest.status === "pending" || latest.status === "running"
              ? "Current review"
              : latest.status === "completed"
                ? "Completed review"
                : "Latest attempt"
          }
          note={
            latest.status === "pending" || latest.status === "running"
              ? "This is the review that is running now. It is separate from any earlier result."
              : undefined
          }
        />
      )}

      {previousCompleted && (
        <ReviewCard
          review={previousCompleted}
          heading="Previous completed review"
          note="This is the last review that finished successfully. It stays available while a newer attempt is running or has failed, and it is not the current attempt."
        />
      )}

      {document.reviews.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">Review history</h2>
          <p className="mt-1 text-sm text-muted">
            Every request is kept. A retry creates a new review and does not replace the previous one.
          </p>
          <ol className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
            {document.reviews.map((review) => (
              <HistoryRow
                key={review.id}
                review={review}
                featured={review.id === latest?.id || review.id === previousCompleted?.id}
              />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function HistoryRow({ review, featured }: { review: ReviewDTO; featured: boolean }) {
  return (
    <li className="px-4 py-3">
      <details>
        <summary className="cursor-pointer list-none">
          <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm">
              <StatusBadge status={review.status} failureCode={review.failureCode} />
              <span className="ml-2 text-ink">{review.lawyer.name}</span>
              <span className="mt-1 block text-muted">
                {formatDateTime(new Date(review.requestedAt))} · {review.findings.length}{" "}
                {review.findings.length === 1 ? "finding" : "findings"}
                {featured ? " · shown in full above" : ""}
              </span>
            </span>
          </span>
        </summary>
        <div className="mt-3">
          {review.errorMessage && review.status === "failed" && (
            <p className="mb-3 text-sm text-rose-900">{review.errorMessage}</p>
          )}
          <FindingList findings={review.findings} label={review.findingsLabel} />
        </div>
      </details>
    </li>
  );
}
