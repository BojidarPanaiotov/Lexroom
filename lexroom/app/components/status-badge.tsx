import type { FailureCode, ReviewStatus } from "@/lib/types";

export function statusText(status: ReviewStatus, failureCode: FailureCode | null): string {
  if (status === "pending") return "Starting";
  if (status === "running") return "In progress";
  if (status === "completed") return "Completed";
  if (failureCode === "timeout") return "Timed out";
  return "Failed";
}

export function StatusBadge({
  status,
  failureCode,
}: {
  status: ReviewStatus;
  failureCode: FailureCode | null;
}) {
  const label = statusText(status, failureCode);
  const tone =
    status === "completed"
      ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
      : status === "failed"
        ? "bg-rose-50 text-rose-900 ring-rose-200"
        : status === "running" || status === "pending"
          ? "bg-sky-50 text-sky-950 ring-sky-200"
          : "bg-stone-100 text-stone-700 ring-stone-200";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {(status === "pending" || status === "running") && (
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
