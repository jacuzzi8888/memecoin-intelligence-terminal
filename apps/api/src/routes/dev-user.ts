import { randomUUID } from "crypto";
import * as schema from "@memecoin/database/schema";

const DEV_USER_EMAIL = "admin@memecoin.dev";

interface QueryableDb {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
}

export async function resolveDevelopmentUser(db: QueryableDb) {
  const users = await db.select().from(schema.users).limit(1);
  return users[0] ?? null;
}

export async function ensureDevelopmentUser(db: QueryableDb) {
  const existing = await db.select().from(schema.users).limit(1);
  const found = existing[0];

  if (found) {
    return found;
  }

  const userId = randomUUID();
  await db.insert(schema.users).values({
    id: userId,
    name: "Dev Admin",
    email: DEV_USER_EMAIL,
    role: "admin",
  });

  await db.insert(schema.userProfiles).values({
    userId,
    displayName: "Dev Admin",
  });

  await db.insert(schema.userSettings).values({
    userId,
  });

  return {
    id: userId,
    name: "Dev Admin",
    email: DEV_USER_EMAIL,
    role: "admin",
  };
}
