import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { sql, desc, asc } from "drizzle-orm";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(["signal_score", "detected_at", "priority"]).default("detected_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  minScore: z.coerce.number().min(0).max(100).optional(),
  priority: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
});

export const scannerRoute: FastifyPluginAsync = async (app) => {
  app.get("/scanner", async (request, reply) => {
    const query = querySchema.parse(request.query);
    const db = getDb();

    const orderCol = query.sortBy === "signal_score" ? schema.signals.signalScore :
                    query.sortBy === "priority" ? schema.signals.priority :
                    schema.signals.detectedAt;
    const orderFn = query.sortOrder === "asc" ? asc : desc;

    const conditions = [];
    if (query.minScore !== undefined) {
      conditions.push(sql`${schema.signals.signalScore} >= ${query.minScore}`);
    }
    if (query.priority !== undefined) {
      conditions.push(sql`${schema.signals.priority} = ${query.priority}`);
    }

    const offset = (query.page - 1) * query.limit;

    const [results, countResult] = await Promise.all([
      db.select({
        id: schema.signals.id,
        tokenAddress: schema.signals.tokenAddress,
        signalScore: schema.signals.signalScore,
        confidence: schema.signals.confidence,
        priority: schema.signals.priority,
        rulesetVersion: schema.signals.rulesetVersion,
        detectedAt: schema.signals.detectedAt,
        tokenSymbol: schema.tokens.symbol,
        tokenName: schema.tokens.name,
      })
        .from(schema.signals)
        .leftJoin(schema.tokens, sql`${schema.signals.tokenAddress} = ${schema.tokens.address}`)
        .orderBy(orderFn(orderCol))
        .limit(query.limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(schema.signals),
    ]);

    const total = Number(countResult[0]?.count || 0);

    return {
      success: true,
      data: results.map((r) => ({
        id: r.id,
        tokenAddress: r.tokenAddress,
        tokenSymbol: r.tokenSymbol || "UNKNOWN",
        tokenName: r.tokenName || "Unknown Token",
        signalScore: r.signalScore,
        confidence: Number(r.confidence),
        priority: r.priority,
        rulesetVersion: r.rulesetVersion,
        detectedAt: r.detectedAt?.toISOString() || new Date().toISOString(),
      })),
      requestId: request.id,
      timestamp: new Date().toISOString(),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });
};
