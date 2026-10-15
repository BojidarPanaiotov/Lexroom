export type ReviewStatus = "pending" | "running" | "completed" | "failed";

export type FailureCode = "timeout" | "service_error";

/** How findings on this review may be read. Only `final` is a completed analysis. */
export type FindingsLabel = "partial" | "final" | "incomplete";

export type LawyerDTO = {
  id: string;
  name: string;
  title: string;
};

export type FindingDTO = {
  id: string;
  sequence: number;
  clause: string | null;
  title: string;
  severity: string;
  excerpt: string | null;
  explanation: string;
  createdAt: string;
};

/** Fields shared by a full review and the short review on the document list. */
export type ReviewBaseDTO = {
  id: string;
  status: ReviewStatus;
  requestedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  deadlineAt: string;
  errorMessage: string | null;
  failureCode: FailureCode | null;
  lawyer: LawyerDTO;
};

/** Full review, including each finding. */
export type ReviewDTO = ReviewBaseDTO & {
  documentId: string;
  findings: FindingDTO[];
  findingsLabel: FindingsLabel;
};

/** Short summary of a review, used on the document list. */
export type ReviewSummaryDTO = ReviewBaseDTO & {
  findingCount: number;
};

export type DocumentRelationDTO = {
  id: string;
  title: string;
};

export type DocumentSummaryDTO = {
  id: string;
  title: string;
  type: string;
  pages: number;
  uploadedAt: string;
  uploadedBy: LawyerDTO;
  supersedes: DocumentRelationDTO | null;
  supersededBy: DocumentRelationDTO | null;
  latestReview: ReviewSummaryDTO | null;
  latestCompletedReview: ReviewSummaryDTO | null;
};

export type DocumentDetailDTO = DocumentSummaryDTO & {
  reviews: ReviewDTO[];
};

export type UsageDTO = {
  used: number;
  inProgress: number;
  limit: number;
  remaining: number;
  resetsAt: string;
  timezone: string;
  month: string;
};

export type ApiErrorCode =
  | "QUOTA_EXCEEDED"
  | "REVIEW_IN_PROGRESS"
  | "NOT_FOUND"
  | "VALIDATION"
  | "UNKNOWN_LAWYER"
  | "INTERNAL";

export type ApiErrorBody = {
  error: string;
  code: ApiErrorCode;
  usage?: UsageDTO;
  activeReview?: {
    id: string;
    requestedAt: string;
    lawyer: LawyerDTO;
  };
};

export type StartedReviewDTO = {
  id: string;
  documentId: string;
  status: ReviewStatus;
  requestedAt: string;
  deadlineAt: string;
};
