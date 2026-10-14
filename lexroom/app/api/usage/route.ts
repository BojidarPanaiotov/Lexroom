import { connection } from "next/server";
import { toErrorResponse } from "@/lib/errors";
import { getUsage } from "@/lib/reviews";

export async function GET() {
  await connection();
  try {
    const usage = await getUsage();
    return Response.json(usage);
  } catch (error) {
    return toErrorResponse(error);
  }
}
