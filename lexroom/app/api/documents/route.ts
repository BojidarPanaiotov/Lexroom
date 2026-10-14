import { connection } from "next/server";
import { toErrorResponse } from "@/lib/errors";
import { getDocuments } from "@/lib/reviews";

export async function GET() {
  await connection();
  try {
    const documents = await getDocuments();
    return Response.json({ documents });
  } catch (error) {
    return toErrorResponse(error);
  }
}
