import { connection } from "next/server";
import { ApiError, toErrorResponse } from "@/lib/errors";
import { getDocument } from "@/lib/reviews";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await ctx.params;
    const document = await getDocument(id);
    if (!document) {
      throw new ApiError(404, "NOT_FOUND", "Document not found.");
    }
    return Response.json({ document });
  } catch (error) {
    return toErrorResponse(error);
  }
}
