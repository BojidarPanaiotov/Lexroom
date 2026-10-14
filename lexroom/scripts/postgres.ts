import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.PGPORT ?? 5432);
const user = process.env.PGUSER ?? "lexroom";
const password = process.env.PGPASSWORD ?? "lexroom";
const database = process.env.PGDATABASE ?? "lexroom";

// Keep the cluster outside the Next.js project. Database writes would otherwise
// restart the dev server on every checkpoint.
const databaseDir =
  process.env.PGDATA ??
  path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".lexroom"), "lexroom", "pgdata");

const postgres = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port,
  persistent: true,
  initdbFlags: ["--locale=C", "--encoding=UTF8"],
  onError: (message) => {
    const text = message instanceof Error ? message.message : String(message);
    if (/exists but is not empty|already exists/i.test(text)) return;
    console.error(text);
  },
});
console.log(postgres);

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  try {
    await postgres.initialise();
    console.log("Initialised a new Postgres cluster.");
  } catch (error) {
    const message = errorText(error);
    if (!/already|exist|initdb|directory/i.test(message)) {
      throw error;
    }
    console.log("Using the existing Postgres cluster.");
  }

  await postgres.start();

  try {
    await postgres.createDatabase(database);
    console.log(`Created database ${database}.`);
  } catch (error) {
    const message = errorText(error);
    if (!/already exists/i.test(message)) throw error;
  }

  const url = `postgresql://${user}:${password}@localhost:${port}/${database}?schema=public`;
  console.log(`Postgres data directory: ${databaseDir}`);
  console.log(`Postgres is accepting connections on port ${port}.`);
  console.log(`DATABASE_URL=${url}`);
  console.log("Leave this process running while you use the app.");
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
