import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type LawyerFile = {
  id: string;
  name: string;
  title: string;
};

type DocumentFile = {
  id: string;
  title: string;
  type: string;
  pages: number;
  uploadedAt: string;
  uploadedBy: string;
  supersedes: string | null;
  findings: unknown;
};

function readJson<T>(filename: string): T {
  const filePath = path.join(process.cwd(), "samples", filename);
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

async function main() {
  const lawyers = readJson<LawyerFile[]>("lawyers.json");
  const documents = readJson<DocumentFile[]>("documents.json");
  const lawyerIds = new Set(lawyers.map((lawyer) => lawyer.id));

  for (const lawyer of lawyers) {
    await prisma.lawyer.upsert({
      where: { id: lawyer.id },
      update: { name: lawyer.name, title: lawyer.title },
      create: lawyer,
    });
  }

  const ordered = [
    ...documents.filter((document) => document.supersedes === null),
    ...documents.filter((document) => document.supersedes !== null),
  ];

  for (const document of ordered) {
    if (!lawyerIds.has(document.uploadedBy)) {
      throw new Error(`Document ${document.id} was uploaded by an unknown lawyer.`);
    }
    if (!Array.isArray(document.findings)) {
      throw new Error(`Document ${document.id} is missing a findings array.`);
    }

    const data = {
      title: document.title,
      type: document.type,
      pages: document.pages,
      uploadedAt: new Date(document.uploadedAt),
      uploadedById: document.uploadedBy,
      supersedesId: document.supersedes,
      expectedFindings: document.findings as Prisma.InputJsonValue,
    };

    await prisma.document.upsert({
      where: { id: document.id },
      update: data,
      create: { id: document.id, ...data },
    });
  }

  console.log(`Seeded ${lawyers.length} lawyers and ${documents.length} documents.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
