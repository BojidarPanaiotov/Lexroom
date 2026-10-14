"use client";

import Link from "next/link";
import { createContext, useContext, useState, useSyncExternalStore } from "react";
import { formatDateTime } from "@/lib/time";
import type { LawyerDTO, UsageDTO } from "@/lib/types";
import { POLL_MS, refreshWorkspace, usePolling } from "./use-polling";

const STORAGE_KEY = "lexroom-lawyer-id";
const EMPTY_LAWYERS: LawyerDTO[] = [];
const lawyerListeners = new Set<() => void>();

function subscribeToLawyer(listener: () => void) {
  lawyerListeners.add(listener);
  return () => lawyerListeners.delete(listener);
}

function readStoredLawyerId() {
  return window.localStorage.getItem(STORAGE_KEY);
}

function writeStoredLawyerId(id: string) {
  window.localStorage.setItem(STORAGE_KEY, id);
  for (const listener of lawyerListeners) listener();
}

type WorkspaceContextValue = {
  lawyers: LawyerDTO[];
  lawyer: LawyerDTO | null;
  lawyerId: string | null;
  setLawyerId: (id: string) => void;
  usage: UsageDTO | null;
  usageError: string | null;
  ready: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside Shell.");
  }
  return value;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const lawyersQuery = usePolling<{ lawyers: LawyerDTO[] }>("/api/lawyers", null);
  const usageQuery = usePolling<UsageDTO>("/api/usage", POLL_MS);
  const lawyers = lawyersQuery.data?.lawyers ?? EMPTY_LAWYERS;
  const storedLawyerId = useSyncExternalStore(subscribeToLawyer, readStoredLawyerId, () => null);
  const lawyer = lawyers.find((item) => item.id === storedLawyerId) ?? lawyers[0] ?? null;
  const lawyerId = lawyer?.id ?? null;
  const ready = lawyers.length > 0;

  function setLawyerId(id: string) {
    writeStoredLawyerId(id);
  }
  const usage = usageQuery.data;
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function resetReviews() {
    const confirmed = window.confirm(
      "Clear every review? Usage returns to 0. Documents and lawyers stay.",
    );
    if (!confirmed) return;
    setResetting(true);
    setResetError(null);
    try {
      const response = await fetch("/api/reviews/reset", { method: "POST" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setResetError(body?.error ?? "Reviews could not be cleared.");
        return;
      }
      refreshWorkspace();
    } catch {
      setResetError("The request could not be sent.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <WorkspaceContext.Provider
      value={{
        lawyers,
        lawyer,
        lawyerId,
        setLawyerId,
        usage,
        usageError: usageQuery.error,
        ready,
      }}
    >
      <div className="min-h-full">
        <header className="border-b border-line bg-card">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Link href="/" className="text-lg font-semibold tracking-tight text-ink">
                Lexroom
              </Link>
              <p className="text-sm text-muted">Shared contract review</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Working as</span>
                <select
                  className="min-w-64 rounded-md border border-line bg-white px-3 py-2 text-ink"
                  value={lawyerId ?? ""}
                  disabled={!ready || lawyers.length === 0}
                  onChange={(event) => setLawyerId(event.target.value)}
                >
                  {lawyers.length === 0 && <option value="">Loading lawyers…</option>}
                  {lawyers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <UsageSummary usage={usage} error={usageQuery.error} loading={usageQuery.loading} />
              <div className="flex flex-col items-start gap-1">
                <button
                  type="button"
                  className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:text-stone-400"
                  onClick={() => void resetReviews()}
                  disabled={resetting}
                >
                  {resetting ? "Resetting…" : "Reset reviews"}
                </button>
                {resetError && (
                  <p className="max-w-64 text-sm text-rose-800" role="alert">
                    {resetError}
                  </p>
                )}
              </div>
            </div>
          </div>
          {usage && usage.remaining === 0 && (
            <div className="border-t border-amber-200 bg-amber-50">
              <p className="mx-auto max-w-5xl px-4 py-3 text-sm text-amber-950">
                No new reviews can be started. {usage.used} completed and {usage.inProgress} in
                progress use the full limit of {usage.limit}. Failed reviews give their place back.
                The quota resets on {formatDateTime(new Date(usage.resetsAt))} ({usage.timezone}).
                Requests are not queued.
              </p>
            </div>
          )}
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </div>
    </WorkspaceContext.Provider>
  );
}

function UsageSummary({
  usage,
  error,
  loading,
}: {
  usage: UsageDTO | null;
  error: string | null;
  loading: boolean;
}) {
  if (error) {
    return <p className="text-sm text-rose-800">Usage unavailable. {error}</p>;
  }
  if (!usage) {
    return <p className="text-sm text-muted">{loading ? "Loading usage…" : "Usage unavailable."}</p>;
  }
  return (
    <div className="text-sm">
      <p className="font-medium text-ink">
        {usage.used} / {usage.limit} reviews used
      </p>
      <p className="text-muted">
        {usage.inProgress > 0
          ? `${usage.inProgress} in progress, holding a place · `
          : ""}
        Resets {formatDateTime(new Date(usage.resetsAt))}
      </p>
    </div>
  );
}
