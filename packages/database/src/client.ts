import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

let _db: ReturnType<typeof createDb> | null = null;

function createDb(connectionString?: string) {
  const url = connectionString || process.env.DATABASE_URL || "postgresql://memecoin:memecoin_dev@localhost:5433/memecoin_intelligence";
  const client = postgres(url);
  return drizzle(client, { schema });
}

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export function createDbConnection(connectionString?: string) {
  return createDb(connectionString);
}

export type Database = ReturnType<typeof createDb>;
