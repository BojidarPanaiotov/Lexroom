import type { ApiErrorBody, ApiErrorCode } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Pick<ApiErrorBody, "usage" | "activeReview">;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    details?: Pick<ApiErrorBody, "usage" | "activeReview">,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      {
        error: error.message,
        code: error.code,
        ...error.details,
      },
      { status: error.status },
    );
  }

  console.error(error);
  return Response.json(
    { error: "Unexpected server error.", code: "INTERNAL" },
    { status: 500 },
  );
}
