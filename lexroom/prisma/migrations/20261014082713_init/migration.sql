-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "Lawyer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "Lawyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pages" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "supersedesId" TEXT,
    "expectedFindings" JSONB NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "activeDocumentId" TEXT,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "errorMessage" TEXT,
    "failureCode" TEXT,
    "simulationPlan" JSONB NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "clause" TEXT,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "excerpt" TEXT,
    "explanation" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_uploadedById_idx" ON "Document"("uploadedById");

-- CreateIndex
CREATE INDEX "Document_supersedesId_idx" ON "Document"("supersedesId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_activeDocumentId_key" ON "Review"("activeDocumentId");

-- CreateIndex
CREATE INDEX "Review_documentId_requestedAt_idx" ON "Review"("documentId", "requestedAt");

-- CreateIndex
CREATE INDEX "Review_status_requestedAt_idx" ON "Review"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "Review_lawyerId_idx" ON "Review"("lawyerId");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_reviewId_sequence_key" ON "Finding"("reviewId", "sequence");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Lawyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "Lawyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An in-progress review occupies its document. A finished review does not.
ALTER TABLE "Review" ADD CONSTRAINT "Review_active_matches_status" CHECK (
  (status IN ('pending', 'running') AND "activeDocumentId" = "documentId")
  OR
  (status IN ('completed', 'failed') AND "activeDocumentId" IS NULL)
);

-- Completed and failed are terminal. Finishing a review also releases the document.
CREATE OR REPLACE FUNCTION "review_status_is_final"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('completed', 'failed') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'review % is already % and cannot change to %', OLD.id, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IN ('completed', 'failed') THEN
    NEW."activeDocumentId" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "review_status_guard"
BEFORE UPDATE ON "Review"
FOR EACH ROW
EXECUTE FUNCTION "review_status_is_final"();

-- Findings can be stored only while the review is still open.
CREATE OR REPLACE FUNCTION "finding_requires_active_review"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_status "ReviewStatus";
BEGIN
  SELECT status INTO current_status FROM "Review" WHERE id = NEW."reviewId";
  IF current_status IS NULL OR current_status NOT IN ('pending', 'running') THEN
    RAISE EXCEPTION 'findings cannot be added to review % in status %', NEW."reviewId", COALESCE(current_status::text, 'missing')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "finding_active_review_guard"
BEFORE INSERT ON "Finding"
FOR EACH ROW
EXECUTE FUNCTION "finding_requires_active_review"();
