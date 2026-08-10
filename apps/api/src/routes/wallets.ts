import { randomUUID } from "crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { enqueueWalletSyncJob } from "@memecoin/indexer";
import { WALLET_SYNC_QUEUE } from "@memecoin/queue";
import { resolveRequestUser } from "./dev-user.js";
import { isValidSolanaWalletAddress } from "./solana-address.js";

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  includeInvalid: z.coerce.boolean().default(false),
});

const createWalletSchema = z.object({
  address: z.string().min(10).max(80),
  label: z.string().max(80).optional(),
});

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export const walletsRoute: FastifyPluginAsync = async (app) => {
  app.get("/wallets", async (request) => {
    const query = querySchema.parse(request.query);
    const db = getDb();
    const walletRows = await db.select().from(schema.wallets).orderBy(desc(schema.wallets.updatedAt)).limit(query.limit * 4);
    const wallets = walletRows
      .filter((wallet) => query.includeInvalid || isValidSolanaWalletAddress(wallet.address))
      .slice(0, query.limit);

    const walletIds = wallets.map((wallet) => wallet.id);
    const walletAddresses = wallets.map((wallet) => wallet.address);

    const [labels, performances, positions, syncJobs] = await Promise.all([
      walletIds.length > 0
        ? db.select().from(schema.walletLabels).where(inArray(schema.walletLabels.walletId, walletIds))
        : Promise.resolve([]),
      walletIds.length > 0
        ? db.select().from(schema.walletPerformance).where(inArray(schema.walletPerformance.walletId, walletIds))
        : Promise.resolve([]),
      walletAddresses.length > 0
        ? db.select().from(schema.walletPositions).where(inArray(schema.walletPositions.walletAddress, walletAddresses))
        : Promise.resolve([]),
      db.select().from(schema.backgroundJobs).where(eq(schema.backgroundJobs.queueName, WALLET_SYNC_QUEUE)).orderBy(desc(schema.backgroundJobs.createdAt)).limit(200),
    ]);

    const latestLabelByWallet = new Map<string, typeof labels[number]>();
    for (const label of labels.sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime())) {
      if (!latestLabelByWallet.has(label.walletId)) {
        latestLabelByWallet.set(label.walletId, label);
      }
    }

    const latestPerformanceByWallet = new Map<string, typeof performances[number]>();
    for (const performance of performances.sort((a, b) => b.calculatedAt.getTime() - a.calculatedAt.getTime())) {
      if (!latestPerformanceByWallet.has(performance.walletId)) {
        latestPerformanceByWallet.set(performance.walletId, performance);
      }
    }

    const positionsByWalletAddress = new Map<string, Array<typeof positions[number]>>();
    for (const position of positions) {
      const existing = positionsByWalletAddress.get(position.walletAddress) ?? [];
      existing.push(position);
      positionsByWalletAddress.set(position.walletAddress, existing);
    }

    const latestSyncJobByWalletAddress = new Map<string, typeof syncJobs[number]>();
    for (const job of syncJobs) {
      const payload = asRecord(job.payload);
      const walletAddress = typeof payload.walletAddress === "string" ? payload.walletAddress : null;
      if (walletAddress && !latestSyncJobByWalletAddress.has(walletAddress)) {
        latestSyncJobByWalletAddress.set(walletAddress, job);
      }
    }

    return {
      success: true,
      data: wallets.map((wallet) => {
        const latestLabel = latestLabelByWallet.get(wallet.id);
        const latestPerformance = latestPerformanceByWallet.get(wallet.id);
        const openPositions = (positionsByWalletAddress.get(wallet.address) ?? []).filter((position) => position.status === "open");
        const latestSyncJob = latestSyncJobByWalletAddress.get(wallet.address);
        const metadata = asRecord(wallet.metadata);
        const qualification = asRecord(metadata.qualification);

        return {
          id: wallet.id,
          address: wallet.address,
          label: wallet.label,
          classification: wallet.classification,
          totalTrades: wallet.totalTrades,
          firstSeenAt: wallet.firstSeenAt?.toISOString() || null,
          lastSeenAt: wallet.lastSeenAt?.toISOString() || null,
          latestLabel: latestLabel
            ? {
              label: latestLabel.label,
              confidence: Number(latestLabel.confidence),
              source: latestLabel.source,
              rulesetVersion: latestLabel.rulesetVersion,
              assignedAt: latestLabel.assignedAt.toISOString(),
            }
            : null,
          performance: latestPerformance
            ? {
              score: latestPerformance.score,
              winRate: latestPerformance.winRate ? Number(latestPerformance.winRate) : null,
              totalTrades: latestPerformance.totalTrades,
              profitableTrades: latestPerformance.profitableTrades,
              totalPnlUsd: latestPerformance.totalPnlUsd ? Number(latestPerformance.totalPnlUsd) : null,
              avgHoldTimeSeconds: latestPerformance.avgHoldTimeSeconds,
              avgReturnPct: latestPerformance.avgReturnPct ? Number(latestPerformance.avgReturnPct) : null,
              calculatedAt: latestPerformance.calculatedAt.toISOString(),
            }
            : null,
          qualification: Object.keys(qualification).length > 0
            ? {
              isQualified: qualification.isQualified === true,
              walletScore: typeof qualification.walletScore === "number" ? qualification.walletScore : null,
              confidence: typeof qualification.confidence === "number" ? qualification.confidence : null,
              reasons: Array.isArray(qualification.reasons) ? qualification.reasons : [],
              rulesetVersion: typeof qualification.rulesetVersion === "string" ? qualification.rulesetVersion : null,
            }
            : null,
          latestSyncJob: latestSyncJob
            ? {
              status: latestSyncJob.status,
              attempts: latestSyncJob.attempts,
              maxAttempts: latestSyncJob.maxAttempts,
              error: latestSyncJob.error,
              createdAt: latestSyncJob.createdAt.toISOString(),
              startedAt: latestSyncJob.startedAt?.toISOString() || null,
              completedAt: latestSyncJob.completedAt?.toISOString() || null,
            }
            : null,
          openPositions: openPositions.map((position) => ({
            tokenAddress: position.tokenAddress,
            amount: Number(position.amount),
            avgEntryPrice: position.avgEntryPrice ? Number(position.avgEntryPrice) : null,
            currentValueUsd: position.currentValueUsd ? Number(position.currentValueUsd) : null,
            realizedPnlUsd: position.realizedPnlUsd ? Number(position.realizedPnlUsd) : null,
            unrealizedPnlUsd: position.unrealizedPnlUsd ? Number(position.unrealizedPnlUsd) : null,
            openedAt: position.openedAt.toISOString(),
          })),
        };
      }),
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.post("/wallets", async (request, reply) => {
    const body = createWalletSchema.parse(request.body || {});
    const db = getDb();

    if (!isValidSolanaWalletAddress(body.address)) {
      reply.status(400);
      return {
        success: false,
        error: "Invalid Solana wallet address",
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    }

    await resolveRequestUser(db, request);

    const existing = await db.select().from(schema.wallets).where(eq(schema.wallets.address, body.address));
    if (existing.length === 0) {
      await db.insert(schema.wallets).values({
        id: randomUUID(),
        address: body.address,
        label: body.label,
        classification: "unknown",
        totalTrades: 0,
      });
    }

    const wallets = await db.select().from(schema.wallets).where(eq(schema.wallets.address, body.address));

    return {
      success: true,
      data: wallets.map((wallet) => ({
        id: wallet.id,
        address: wallet.address,
        label: wallet.label,
        classification: wallet.classification,
        totalTrades: wallet.totalTrades,
      })),
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });

  app.post("/wallets/:address/sync", async (request, reply) => {
    const params = z.object({ address: z.string() }).parse(request.params);

    try {
      if (!isValidSolanaWalletAddress(params.address)) {
        reply.status(400);
        return {
          success: false,
          error: "Invalid Solana wallet address",
          requestId: request.id,
          timestamp: new Date().toISOString(),
        };
      }

      const result = await enqueueWalletSyncJob(params.address, "api");
      return {
        success: true,
        data: {
          mode: "queue",
          ...result,
        },
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      reply.status(400);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Wallet sync failed",
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };
    }
  });
};
