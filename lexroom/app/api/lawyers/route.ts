import { connection } from "next/server";
import { toErrorResponse } from "@/lib/errors";
import { listLawyers } from "@/lib/reviews";

export async function GET() {
  await connection();
  try {
    const lawyers = await listLawyers();
    return Response.json({ lawyers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
