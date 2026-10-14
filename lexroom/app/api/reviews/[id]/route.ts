import { connection } from "next/server";
import { ApiError, toErrorResponse } from "@/lib/errors";
import { getReview } from "@/lib/reviews";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await ctx.params;
    const review = await getReview(id);
    if (!review) {
      throw new ApiError(404, "NOT_FOUND", "Review not found.");
    }
    return Response.json({ review });
  } catch (error) {
    return toErrorResponse(error);
  }
}
