import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { resolveSourceMetadata } from "./source-metadata.js";

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(20),
});

export const alertsRoute: FastifyPluginAsync = async (app) => {
  app.get("/alerts", async (request) => {
    const query = querySchema.parse(request.query);
    const db = getDb();

    const alertRows = await db.select({
      id: schema.alerts.id,
      tokenAddress: schema.alerts.tokenAddress,
      priority: schema.alerts.priority,
      title: schema.alerts.title,
      message: schema.alerts.message,
      signalScore: schema.alerts.signalScore,
      webDeepLink: schema.alerts.webDeepLink,
      telegramDeepLink: schema.alerts.telegramDeepLink,
      status: schema.alerts.status,
      triggeredAt: schema.alerts.triggeredAt,
      strategyName: schema.strategies.name,
      signalMetadata: schema.signals.metadata,
      detectedAt: schema.signals.detectedAt,
      tokenFirstSeenAt: schema.tokens.firstSeenAt,
    })
      .from(schema.alerts)
      .leftJoin(schema.strategies, eq(schema.alerts.strategyId, schema.strategies.id))
      .leftJoin(schema.signals, eq(schema.alerts.signalId, schema.signals.id))
      .leftJoin(schema.tokens, eq(schema.alerts.tokenAddress, schema.tokens.address))
      .orderBy(desc(schema.alerts.triggeredAt))
      .limit(query.limit);

    const tokenAddresses = [...new Set(alertRows.map((alert) => alert.tokenAddress))];
    const [snapshotRows, launchRows] = tokenAddresses.length > 0
      ? await Promise.all([
        db.select({
          tokenAddress: schema.tokenSnapshots.tokenAddress,
          snapshotAt: schema.tokenSnapshots.snapshotAt,
        })
          .from(schema.tokenSnapshots)
          .where(inArray(schema.tokenSnapshots.tokenAddress, tokenAddresses))
          .orderBy(desc(schema.tokenSnapshots.snapshotAt)),
        db.select({
          tokenAddress: schema.tokenLaunches.tokenAddress,
          launchedAt: schema.tokenLaunches.launchedAt,
          metadata: schema.tokenLaunches.metadata,
        })
          .from(schema.tokenLaunches)
          .where(inArray(schema.tokenLaunches.tokenAddress, tokenAddresses))
          .orderBy(desc(schema.tokenLaunches.launchedAt)),
      ])
      : [[], []];

    const snapshotByToken = new Map<string, { snapshotAt: Date }>();
    for (const snapshot of snapshotRows) {
      if (!snapshotByToken.has(snapshot.tokenAddress)) {
        snapshotByToken.set(snapshot.tokenAddress, snapshot);
      }
    }

    const launchByToken = new Map<string, { launchedAt: Date; metadata: unknown }>();
    for (const launch of launchRows) {
      if (!launchByToken.has(launch.tokenAddress)) {
        launchByToken.set(launch.tokenAddress, launch);
      }
    }

    return {
      success: true,
      data: alertRows.map((a) => ({
        ...resolveSourceMetadata({
          signalMetadata: a.signalMetadata,
          launchMetadata: launchByToken.get(a.tokenAddress)?.metadata,
          snapshotAt: snapshotByToken.get(a.tokenAddress)?.snapshotAt,
          detectedAt: a.detectedAt,
          launchedAt: launchByToken.get(a.tokenAddress)?.launchedAt,
          firstSeenAt: a.tokenFirstSeenAt,
        }),
        id: a.id,
        tokenAddress: a.tokenAddress,
        priority: a.priority,
        title: a.title,
        message: a.message,
        signalScore: a.signalScore,
        strategyName: a.strategyName || "Unknown",
        webDeepLink: a.webDeepLink,
        telegramDeepLink: a.telegramDeepLink,
        status: a.status,
        triggeredAt: a.triggeredAt?.toISOString() || new Date().toISOString(),
      })),
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
