import { z } from "zod";

export const solanaAddressSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address");

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const tokenSchema = z.object({
  address: solanaAddressSchema,
  symbol: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  decimals: z.number().int().min(0).max(18).default(9),
});

export const walletSchema = z.object({
  address: solanaAddressSchema,
  label: z.string().optional(),
  classification: z.enum(["unknown", "legitimate_trader", "early_buyer", "bot", "insider", "bundler", "farmer", "whale", "sniper", "diamond_hands", "paper_hands"]).default("unknown"),
});

export const prioritySchema = z.enum(["critical", "high", "medium", "low", "info"]);

export const signalScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  rulesetVersion: z.string(),
  positiveFactors: z.array(z.object({
    factorName: z.string(),
    contribution: z.number(),
    rawValue: z.union([z.number(), z.string()]).optional(),
  })),
  negativeFactors: z.array(z.object({
    factorName: z.string(),
    contribution: z.number(),
    rawValue: z.union([z.number(), z.string()]).optional(),
  })),
  missingFeatures: z.array(z.string()),
  calculatedAt: z.string().datetime(),
});

export const alertSchema = z.object({
  id: z.string(),
  tokenAddress: z.string(),
  priority: prioritySchema,
  signalScore: z.number().int(),
  title: z.string(),
  message: z.string(),
  webDeepLink: z.string().optional(),
  telegramDeepLink: z.string().optional(),
  status: z.enum(["pending", "delivered", "failed"]),
  triggeredAt: z.string().datetime(),
});

export const apiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    requestId: z.string(),
    timestamp: z.string().datetime(),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }).optional(),
  });

export const healthSchema = z.object({
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  timestamp: z.string().datetime(),
  version: z.string(),
  uptime: z.number(),
  services: z.object({
    database: z.enum(["up", "down"]),
    redis: z.enum(["up", "down"]),
    providers: z.enum(["up", "down", "degraded"]),
  }),
});

export type SolanaAddress = z.infer<typeof solanaAddressSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type SignalScore = z.infer<typeof signalScoreSchema>;
export type Alert = z.infer<typeof alertSchema>;
export type HealthStatus = z.infer<typeof healthSchema>;
