import { Suspense } from "react";
import { DocumentScreen } from "@/app/components/document-screen";

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading document…</p>}>
      <DocumentLoader params={params} />
    </Suspense>
  );
}

async function DocumentLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentScreen id={id} />;
}
