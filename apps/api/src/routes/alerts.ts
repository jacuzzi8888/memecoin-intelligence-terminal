import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { backfillAlertOutcomes, getAlertOutcomeSummary } from "@memecoin/indexer";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { resolveSourceMetadata } from "./source-metadata.js";
import { getRecentWindow, serializeRecentWindow } from "./recent-window.js";
import { resolveRequestUser } from "./dev-user.js";
import { reviewRecommendation } from "./alert-review.js";

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(20),
  sinceDays: z.coerce.number().min(1).max(30).default(1),
});

const outcomeBackfillBodySchema = z.object({
  limit: z.coerce.number().min(1).max(1000).default(200),
  sinceDays: z.coerce.number().min(1).max(30).default(7),
}).default({
  limit: 200,
  sinceDays: 7,
});

const reviewBodySchema = z.object({
  verdict: z.enum(["valid", "false_positive", "uncertain"]),
  notes: z.string().max(2000).optional(),
});

export const alertsRoute: FastifyPluginAsync = async (app) => {
  app.get("/alerts", async (request) => {
    const query = querySchema.parse(request.query);
    const db = getDb();
    const since = getRecentWindow(query.sinceDays);

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
      .where(gte(schema.alerts.triggeredAt, since))
      .orderBy(desc(schema.alerts.triggeredAt))
      .limit(query.limit);

    const tokenAddresses = [...new Set(alertRows.map((alert) => alert.tokenAddress))];
    const alertIds = alertRows.map((alert) => alert.id);
    const [snapshotRows, launchRows, outcomeRows, reviewRows] = tokenAddresses.length > 0
      ? await Promise.all([
        db.select({
          tokenAddress: schema.tokenSnapshots.tokenAddress,
          snapshotAt: schema.tokenSnapshots.snapshotAt,
        })
          .from(schema.tokenSnapshots)
          .where(and(inArray(schema.tokenSnapshots.tokenAddress, tokenAddresses), gte(schema.tokenSnapshots.snapshotAt, since)))
          .orderBy(desc(schema.tokenSnapshots.snapshotAt)),
        db.select({
          tokenAddress: schema.tokenLaunches.tokenAddress,
          launchedAt: schema.tokenLaunches.launchedAt,
          metadata: schema.tokenLaunches.metadata,
        })
          .from(schema.tokenLaunches)
          .where(and(inArray(schema.tokenLaunches.tokenAddress, tokenAddresses), gte(schema.tokenLaunches.launchedAt, since)))
          .orderBy(desc(schema.tokenLaunches.launchedAt)),
        alertIds.length > 0
          ? db.select().from(schema.alertOutcomes)
            .where(inArray(schema.alertOutcomes.alertId, alertIds))
            .orderBy(desc(schema.alertOutcomes.recordedAt))
          : Promise.resolve([]),
        alertIds.length > 0
          ? db.select().from(schema.alertReviews)
            .where(inArray(schema.alertReviews.alertId, alertIds))
          : Promise.resolve([]),
      ])
      : [[], [], [], []];

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

    const outcomesByAlert = new Map<string, Array<{
      outcomeType: string;
      outcomeValue: number | null;
      recordedAt: string;
      metadata: unknown;
    }>>();
    for (const outcome of outcomeRows) {
      const outcomes = outcomesByAlert.get(outcome.alertId) ?? [];
      outcomes.push({
        outcomeType: outcome.outcomeType,
        outcomeValue: outcome.outcomeValue !== null ? Number(outcome.outcomeValue) : null,
        recordedAt: outcome.recordedAt.toISOString(),
        metadata: outcome.metadata,
      });
      outcomesByAlert.set(outcome.alertId, outcomes);
    }

    const reviewsByAlert = new Map(reviewRows.map((review) => [review.alertId, {
      verdict: review.verdict,
      notes: review.notes,
      reviewedBy: review.reviewedBy,
      reviewedAt: review.reviewedAt.toISOString(),
    }]));

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
        outcomes: outcomesByAlert.get(a.id) ?? [],
        review: reviewsByAlert.get(a.id) ?? null,
        reviewRecommendation: reviewRecommendation(outcomesByAlert.get(a.id) ?? []),
        triggeredAt: a.triggeredAt?.toISOString() || new Date().toISOString(),
      })),
      requestId: request.id,
      timestamp: new Date().toISOString(),
      dataWindow: serializeRecentWindow(since),
    };
  });

  app.get("/alerts/reviews/summary", async (request) => {
    const query = querySchema.parse(request.query);
    const db = getDb();
    const since = getRecentWindow(query.sinceDays);
    const rows = await db.select({
      strategyId: schema.alerts.strategyId,
      strategyName: schema.strategies.name,
      verdict: schema.alertReviews.verdict,
    })
      .from(schema.alerts)
      .leftJoin(schema.strategies, eq(schema.alerts.strategyId, schema.strategies.id))
      .leftJoin(schema.alertReviews, eq(schema.alertReviews.alertId, schema.alerts.id))
      .where(gte(schema.alerts.triggeredAt, since));

    const reviewed = rows.filter((row) => row.verdict !== null);
    const byStrategy = new Map<string, { strategyName: string; total: number; reviewed: number; falsePositives: number }>();
    for (const row of rows) {
      const current = byStrategy.get(row.strategyId) ?? {
        strategyName: row.strategyName ?? "Unknown strategy",
        total: 0,
        reviewed: 0,
        falsePositives: 0,
      };
      current.total++;
      if (row.verdict !== null) current.reviewed++;
      if (row.verdict === "false_positive") current.falsePositives++;
      byStrategy.set(row.strategyId, current);
    }

    return {
      success: true,
      data: {
        total: rows.length,
        reviewed: reviewed.length,
        needsReview: rows.length - reviewed.length,
        falsePositiveRate: reviewed.length > 0
          ? rows.filter((row) => row.verdict === "false_positive").length / reviewed.length
          : null,
        byStrategy: [...byStrategy.entries()].map(([strategyId, summary]) => ({
          strategyId,
          ...summary,
          falsePositiveRate: summary.reviewed > 0 ? summary.falsePositives / summary.reviewed : null,
        })),
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
      dataWindow: serializeRecentWindow(since),
    };
  });

  app.put<{ Params: { id: string } }>("/alerts/:id/review", async (request, reply) => {
    const body = reviewBodySchema.parse(request.body ?? {});
    const db = getDb();
    const user = await resolveRequestUser(db, request);
    const alertRows = await db.select({ id: schema.alerts.id, userId: schema.alerts.userId })
      .from(schema.alerts)
      .where(eq(schema.alerts.id, request.params.id))
      .limit(1);
    const alert = alertRows[0];
    if (!alert || (alert.userId && alert.userId !== user.id)) {
      reply.status(404);
      return { success: false, error: "Alert not found", requestId: request.id, timestamp: new Date().toISOString() };
    }

    const reviewedAt = new Date();
    await db.insert(schema.alertReviews).values({
      alertId: alert.id,
      verdict: body.verdict,
      notes: body.notes?.trim() || null,
      reviewedBy: user.id,
      reviewedAt,
    }).onConflictDoUpdate({
      target: schema.alertReviews.alertId,
      set: {
        verdict: body.verdict,
        notes: body.notes?.trim() || null,
        reviewedBy: user.id,
        reviewedAt,
      },
    });

    return {
      success: true,
      data: {
        alertId: alert.id,
        verdict: body.verdict,
        notes: body.notes?.trim() || null,
        reviewedBy: user.id,
        reviewedAt: reviewedAt.toISOString(),
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/alerts/outcomes/summary", async (request) => {
    const query = querySchema.parse(request.query);
    const summary = await getAlertOutcomeSummary({ sinceDays: query.sinceDays });

    return {
      success: true,
      data: summary,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.post("/alerts/outcomes/backfill", async (request) => {
    const body = outcomeBackfillBodySchema.parse(request.body ?? {});
    const result = await backfillAlertOutcomes({
      limit: body.limit,
      sinceDays: body.sinceDays,
    });

    return {
      success: true,
      data: result,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
