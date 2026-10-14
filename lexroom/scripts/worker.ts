import { prisma } from "../lib/prisma";
import { tick } from "../lib/reviews";

const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 500);

async function loop(): Promise<void> {
  if (!Number.isFinite(intervalMs) || intervalMs < 50) {
    throw new Error("WORKER_INTERVAL_MS must be a number of at least 50.");
  }
  console.log(`Review worker polling every ${intervalMs}ms.`);
  for (;;) {
    const started = Date.now();
    try {
      await tick();
    } catch (error) {
      console.error("[worker] tick failed", error);
    }
    const wait = Math.max(0, intervalMs - (Date.now() - started));
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

loop()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
