"use client";

import Link from "next/link";
import { documentTypeLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import type { DocumentSummaryDTO } from "@/lib/types";
import { StatusBadge } from "./status-badge";
import { POLL_MS, usePolling } from "./use-polling";

export function Workspace() {
  const query = usePolling<{ documents: DocumentSummaryDTO[] }>("/api/documents", POLL_MS);
  const documents = query.data?.documents;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace documents</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
          One shared workspace. Choose who you are working as, then open a document to request a
          review or read the findings. Everyone sees the same review state.
        </p>
      </div>

      {query.loading && !documents && <p className="text-sm text-muted">Loading documents…</p>}
      {query.error && !documents && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          The workspace could not be loaded. {query.error}
        </p>
      )}
      {query.error && documents && (
        <p className="mb-4 text-sm text-rose-800" role="status">
          Latest refresh failed. Showing the last loaded list. {query.error}
        </p>
      )}

      {documents && documents.length === 0 && (
        <p className="text-sm text-muted">No documents are in the workspace yet.</p>
      )}

      {documents && documents.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {documents.map((document) => {
            const latest = document.latestReview;
            const previous =
              document.latestCompletedReview &&
              document.latestCompletedReview.id !== latest?.id
                ? document.latestCompletedReview
                : null;
            return (
              <li key={document.id} className="px-4 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      {documentTypeLabel(document.type)} · {document.pages}{" "}
                      {document.pages === 1 ? "page" : "pages"}
                    </p>
                    <Link
                      href={`/documents/${document.id}`}
                      className="mt-1 block text-lg font-semibold text-ink underline-offset-4 hover:text-navy hover:underline"
                    >
                      {document.title}
                    </Link>
                    <p className="mt-1 text-sm text-muted">
                      Uploaded {formatDateTime(new Date(document.uploadedAt))} by{" "}
                      {document.uploadedBy.name}
                    </p>
                    {document.supersedes && (
                      <p className="mt-1 text-sm text-muted">Replaces {document.supersedes.title}</p>
                    )}
                    {document.supersededBy && (
                      <p className="mt-1 text-sm text-muted">
                        Superseded by {document.supersededBy.title}
                      </p>
                    )}
                  </div>
                  <div className="text-sm md:max-w-xs md:text-right">
                    {latest ? (
                      <>
                        <StatusBadge status={latest.status} failureCode={latest.failureCode} />
                        <p className="mt-2 text-muted">
                          Requested by {latest.lawyer.name}
                          <br />
                          {formatDateTime(new Date(latest.requestedAt))}
                        </p>
                      </>
                    ) : (
                      <p className="text-muted">No review yet</p>
                    )}
                    {previous && (
                      <p className="mt-2 text-muted">A previous completed review is on file.</p>
                    )}
                    <Link
                      href={`/documents/${document.id}`}
                      className="mt-2 inline-block font-medium text-navy underline-offset-4 hover:underline"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
