import { randomUUID } from "crypto";
import * as schema from "@memecoin/database/schema";
import { getEnv } from "@memecoin/config";
import { eq } from "drizzle-orm";

const DEV_USER_EMAIL = "admin@memecoin.dev";

interface QueryableDb {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
}

interface AuthenticatedRequest {
  headers: object;
  userPrincipal?: string;
}

export async function resolveDevelopmentUser(db: QueryableDb) {
  assertDevelopmentAuthEnabled();
  const users = await db.select().from(schema.users).limit(1);
  return users[0] ?? null;
}

export async function ensureDevelopmentUser(db: QueryableDb) {
  assertDevelopmentAuthEnabled();
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

export async function resolveRequestUser(db: QueryableDb, request: AuthenticatedRequest) {
  const principal = request.userPrincipal;
  if (principal) {
    const users = await db.select().from(schema.users).where(eq(schema.users.email, principal)).limit(1);
    const user = users[0];
    if (user) return user;
    const env = getEnv();
    if ((env.NODE_ENV === "development" || env.NODE_ENV === "test") && principal === DEV_USER_EMAIL) {
      return ensureDevelopmentUser(db);
    }

    const userId = randomUUID();
    await db.insert(schema.users).values({
      id: userId,
      name: principal.split("@", 1)[0] || "Aegis Trader",
      email: principal,
      role: "user",
    });
    await db.insert(schema.userProfiles).values({ userId, displayName: principal.split("@", 1)[0] || "Aegis Trader" });
    await db.insert(schema.userSettings).values({ userId });
    return { id: userId, name: principal.split("@", 1)[0] || "Aegis Trader", email: principal, role: "user" };
  }

  return ensureDevelopmentUser(db);
}

function assertDevelopmentAuthEnabled() {
  const env = getEnv();
  if (env.ENABLE_DEV_AUTH === false || (env.NODE_ENV !== "development" && env.NODE_ENV !== "test" && !env.PERSONAL_APP_MODE)) {
    throw new Error("Development user fallback is disabled outside development and test environments");
  }
}
