export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  nda: "NDA",
  lease: "Lease",
  employment: "Employment",
  saas: "SaaS",
  supply: "Supply",
  distribution: "Distribution",
  services: "Services",
  loan: "Loan",
  shareholders: "Shareholders' agreement",
  license: "License",
  settlement: "Settlement",
  franchise: "Franchise",
};

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type;
}

export function severityLabel(severity: string): string {
  if (severity === "high") return "High";
  if (severity === "medium") return "Medium";
  if (severity === "low") return "Low";
  return severity;
}
