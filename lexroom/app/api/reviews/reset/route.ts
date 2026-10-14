import { connection } from "next/server";
import { toErrorResponse } from "@/lib/errors";
import { resetReviews } from "@/lib/reviews";

export async function POST() {
  await connection();
  try {
    const result = await resetReviews();
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
