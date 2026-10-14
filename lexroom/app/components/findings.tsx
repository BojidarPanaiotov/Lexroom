import { severityLabel } from "@/lib/labels";
import type { FindingDTO, FindingsLabel } from "@/lib/types";

function severityTone(severity: string): string {
  if (severity === "high") return "bg-rose-50 text-rose-900 ring-rose-200";
  if (severity === "medium") return "bg-amber-50 text-amber-950 ring-amber-200";
  return "bg-stone-100 text-stone-700 ring-stone-200";
}

export function FindingList({
  findings,
  label,
}: {
  findings: FindingDTO[];
  label: FindingsLabel;
}) {
  if (findings.length === 0) {
    return (
      <p className="text-sm text-muted">
        {label === "final"
          ? "No issues found."
          : label === "partial"
            ? "No findings yet."
            : "No findings were saved before the review stopped."}
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {findings.map((finding) => (
        <li key={finding.id} className="rounded-lg border border-line bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${severityTone(finding.severity)}`}>
              {severityLabel(finding.severity)}
            </span>
            <span className="text-xs text-muted">
              {finding.clause ? `Clause ${finding.clause}` : "No clause number"}
            </span>
          </div>
          <h3 className="mt-2 text-base font-semibold text-ink">{finding.title}</h3>
          {finding.excerpt && (
            <blockquote className="mt-2 border-l-2 border-line pl-3 text-sm text-stone-700">
              {finding.excerpt}
            </blockquote>
          )}
          <p className="mt-2 text-sm leading-6 text-stone-700">{finding.explanation}</p>
        </li>
      ))}
    </ol>
  );
}
