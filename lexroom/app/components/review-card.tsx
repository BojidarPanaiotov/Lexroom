"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/time";
import type { ReviewDTO } from "@/lib/types";
import { FindingList } from "./findings";
import { StatusBadge } from "./status-badge";

export function ReviewCard({
  review,
  heading,
  note,
}: {
  review: ReviewDTO;
  heading: string;
  note?: string;
}) {
  const partial = review.findingsLabel === "partial";
  const incomplete = review.findingsLabel === "incomplete";
  const final = review.findingsLabel === "final";
  const border = final
    ? "border-emerald-200"
    : incomplete
      ? "border-rose-200"
      : "border-sky-200";

  return (
    <section className={`rounded-xl border ${border} bg-card p-4`} aria-labelledby={`${review.id}-heading`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id={`${review.id}-heading`} className="text-lg font-semibold">
            {heading}
          </h2>
          {note && <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{note}</p>}
          <p className="mt-2 text-sm text-muted">
            Requested by {review.lawyer.name}, {review.lawyer.title}, on{" "}
            {formatDateTime(new Date(review.requestedAt))}.
          </p>
          <p className="mt-1 font-mono text-xs text-stone-500">{review.id}</p>
        </div>
        <StatusBadge status={review.status} failureCode={review.failureCode} />
      </div>

      {partial && <Elapsed review={review} />}

      {partial && (
        <p className="mt-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-950" role="status">
          Partial results — not final. Findings can still arrive, and this review can still fail.
        </p>
      )}
      {incomplete && (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-950" role="status">
          Incomplete — not a completed analysis. {review.errorMessage}
        </p>
      )}
      {final && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950" role="status">
          Final results
          {review.completedAt
            ? `, completed on ${formatDateTime(new Date(review.completedAt))}`
            : ""}
          .
        </p>
      )}

      <div className="mt-4">
        <FindingList findings={review.findings} label={review.findingsLabel} />
      </div>
    </section>
  );
}

function Elapsed({ review }: { review: ReviewDTO }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const requested = new Date(review.requestedAt).getTime();
  const deadline = new Date(review.deadlineAt).getTime();
  const limit = Math.max(1, Math.round((deadline - requested) / 1000));
  const elapsed = Math.max(0, Math.floor((now - requested) / 1000));
  const overtime = elapsed >= limit;

  return (
    <p className="mt-3 text-sm text-muted">
      {overtime
        ? `Past the ${limit}s deadline. The server will mark this review as failed, and anything arriving after the deadline is ignored.`
        : `Elapsed ${elapsed}s of ${limit}s.`}
    </p>
  );
}
