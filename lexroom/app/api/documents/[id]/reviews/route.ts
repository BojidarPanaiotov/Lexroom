import { connection } from "next/server";
import { ApiError, toErrorResponse } from "@/lib/errors";
import { startReview } from "@/lib/reviews";
import { parseStartReviewBody } from "@/lib/validation";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await ctx.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "VALIDATION", "Request body must be JSON.");
    }
    const input = parseStartReviewBody(body);
    const review = await startReview({
      documentId: id,
      lawyerId: input.lawyerId,
      simulation: input.simulation,
    });
    return Response.json(review, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
