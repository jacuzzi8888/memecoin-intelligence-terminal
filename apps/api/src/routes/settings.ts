import { randomUUID } from "crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { eq, isNull, or } from "drizzle-orm";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { resolveRequestUser } from "./dev-user.js";

const updateSettingsSchema = z.object({
  preferences: z.record(z.any()).optional(),
  notificationPrefs: z.record(z.any()).optional(),
  displayPrefs: z.record(z.any()).optional(),
  tradingPrefs: z.record(z.any()).optional(),
});

const updateStrategySchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(240).optional(),
  isActive: z.boolean(),
  config: z.record(z.any()).default({}),
});

const createDestinationSchema = z.object({
  channel: z.enum(["telegram", "discord", "dev_outbox"]),
  destination: z.string().min(1).max(300),
  enabled: z.boolean().default(true),
  priorityMin: z.enum(["critical", "high", "medium", "low", "info"]).default("medium"),
});

const updateDestinationSchema = createDestinationSchema.partial().extend({
  destination: z.string().min(1).max(300).optional(),
});

export const settingsRoute: FastifyPluginAsync = async (app) => {
  app.get("/settings", async (request) => {
    const db = getDb();
    const user = await resolveRequestUser(db, request);

    const [settingsRows, destinations, strategies, strategyVersions] = await Promise.all([
      db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, user.id)),
      db.select().from(schema.notificationDestinations).where(eq(schema.notificationDestinations.userId, user.id)),
      db.select().from(schema.strategies).where(or(eq(schema.strategies.userId, user.id), isNull(schema.strategies.userId))),
      db.select().from(schema.strategyVersions),
    ]);

    const settings = settingsRows[0] ?? null;
    const visibleStrategyIds = new Set(strategies.map((strategy) => strategy.id));
    const versionByStrategyId = new Map<string, Array<typeof strategyVersions[number]>>();
    for (const version of strategyVersions) {
      if (!visibleStrategyIds.has(version.strategyId)) continue;
      const existing = versionByStrategyId.get(version.strategyId) ?? [];
      existing.push(version);
      versionByStrategyId.set(version.strategyId, existing);
    }

    return {
      success: true,
      data: {
        settings: settings
          ? {
            preferences: settings.preferences,
            notificationPrefs: settings.notificationPrefs,
            displayPrefs: settings.displayPrefs,
            tradingPrefs: settings.tradingPrefs,
          }
          : {
            preferences: {},
            notificationPrefs: {},
            displayPrefs: {},
            tradingPrefs: {},
          },
        destinations: destinations.map((destination) => ({
          id: destination.id,
          channel: destination.channel,
          destination: destination.destination,
          enabled: destination.enabled,
          priorityMin: destination.priorityMin,
        })),
        strategies: strategies.map((strategy) => ({
          id: strategy.id,
          name: strategy.name,
          description: strategy.description,
          isActive: strategy.isActive === "true",
          currentVersion: strategy.currentVersion,
          versions: (versionByStrategyId.get(strategy.id) ?? [])
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((version) => ({
              id: version.id,
              version: version.version,
              isActive: version.isActive === "true",
              config: version.config,
              createdAt: version.createdAt.toISOString(),
            })),
        })),
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.put("/settings", async (request) => {
    const body = updateSettingsSchema.parse(request.body || {});
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const existing = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, user.id));
    const current = existing[0];

    if (current) {
      await db.update(schema.userSettings)
        .set({
          preferences: body.preferences ?? current.preferences,
          notificationPrefs: body.notificationPrefs ?? current.notificationPrefs,
          displayPrefs: body.displayPrefs ?? current.displayPrefs,
          tradingPrefs: body.tradingPrefs ?? current.tradingPrefs,
          updatedAt: new Date(),
        })
        .where(eq(schema.userSettings.userId, user.id));
    } else {
      await db.insert(schema.userSettings).values({
        userId: user.id,
        preferences: body.preferences ?? {},
        notificationPrefs: body.notificationPrefs ?? {},
        displayPrefs: body.displayPrefs ?? {},
        tradingPrefs: body.tradingPrefs ?? {},
      });
    }

    return {
      success: true,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.post("/settings/strategies", async (request) => {
    const body = updateStrategySchema.parse(request.body || {});
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const strategyId = randomUUID();
    const versionId = randomUUID();
    const version = `v${Date.now()}`;

    await db.insert(schema.strategies).values({
      id: strategyId,
      name: body.name,
      description: body.description,
      userId: user.id,
      isActive: body.isActive ? "true" : "false",
      currentVersion: version,
    });

    await db.insert(schema.strategyVersions).values({
      id: versionId,
      strategyId,
      version,
      config: body.config,
      isActive: body.isActive ? "true" : "false",
    });

    return {
      success: true,
      data: {
        strategyId,
        version,
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.put("/settings/strategies/:strategyId", async (request, reply) => {
    const params = z.object({ strategyId: z.string() }).parse(request.params);
    const body = updateStrategySchema.parse(request.body || {});
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const existing = await db.select().from(schema.strategies).where(eq(schema.strategies.id, params.strategyId));
    const strategy = existing[0];

    if (!strategy || strategy.userId !== user.id) {
      reply.status(404);
      return {
        success: false,
        error: "Strategy not found",
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    }

    const nextVersion = `v${Date.now()}`;
    await db.update(schema.strategies)
      .set({
        name: body.name,
        description: body.description,
        isActive: body.isActive ? "true" : "false",
        currentVersion: nextVersion,
        updatedAt: new Date(),
      })
      .where(eq(schema.strategies.id, strategy.id));

    await db.insert(schema.strategyVersions).values({
      id: randomUUID(),
      strategyId: strategy.id,
      version: nextVersion,
      config: body.config,
      isActive: body.isActive ? "true" : "false",
    });

    return {
      success: true,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.delete("/settings/strategies/:strategyId", async (request, reply) => {
    const params = z.object({ strategyId: z.string() }).parse(request.params);
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const existing = await db.select().from(schema.strategies).where(eq(schema.strategies.id, params.strategyId));
    if (existing.length === 0 || existing[0]?.userId !== user.id) {
      reply.status(404);
      return {
        success: false,
        error: "Strategy not found",
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    }

    await db.delete(schema.strategies).where(eq(schema.strategies.id, params.strategyId));
    return {
      success: true,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.post("/settings/destinations", async (request) => {
    const body = createDestinationSchema.parse(request.body || {});
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const destinationId = randomUUID();

    await db.insert(schema.notificationDestinations).values({
      id: destinationId,
      userId: user.id,
      channel: body.channel,
      destination: body.destination,
      enabled: body.enabled,
      priorityMin: body.priorityMin,
    });

    return {
      success: true,
      data: {
        destinationId,
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.put("/settings/destinations/:destinationId", async (request, reply) => {
    const params = z.object({ destinationId: z.string() }).parse(request.params);
    const body = updateDestinationSchema.parse(request.body || {});
    const db = getDb();
    const existing = await db.select().from(schema.notificationDestinations).where(eq(schema.notificationDestinations.id, params.destinationId));
    const destination = existing[0];

    if (!destination) {
      reply.status(404);
      return {
        success: false,
        error: "Destination not found",
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    }

    await db.update(schema.notificationDestinations)
      .set({
        channel: body.channel ?? destination.channel,
        destination: body.destination ?? destination.destination,
        enabled: body.enabled ?? destination.enabled,
        priorityMin: body.priorityMin ?? destination.priorityMin,
        updatedAt: new Date(),
      })
      .where(eq(schema.notificationDestinations.id, destination.id));

    return {
      success: true,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.delete("/settings/destinations/:destinationId", async (request, reply) => {
    const params = z.object({ destinationId: z.string() }).parse(request.params);
    const db = getDb();
    const existing = await db.select().from(schema.notificationDestinations).where(eq(schema.notificationDestinations.id, params.destinationId));
    if (existing.length === 0) {
      reply.status(404);
      return {
        success: false,
        error: "Destination not found",
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    }

    await db.delete(schema.notificationDestinations).where(eq(schema.notificationDestinations.id, params.destinationId));
    return {
      success: true,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
