import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const connectionString = process.env.DATABASE_URL || "postgresql://memecoin:memecoin_dev@localhost:5433/memecoin_intelligence";
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

async function main() {
  console.log("Running migrations...");
  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete.");
  await migrationClient.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
