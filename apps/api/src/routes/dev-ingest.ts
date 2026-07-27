import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import { runIngestionPipeline } from "@memecoin/indexer";
import { logger } from "@memecoin/logger";
import { z } from "zod";

const log = logger("api:dev-ingest");

const ingestSchema = z.object({
  symbol: z.string().default("DEVTK"),
  name: z.string().default("Development Token"),
  initialLiquidity: z.number().default(15000),
});

export const devIngestRoute: FastifyPluginAsync = async (app) => {
  app.post("/dev/ingest", async (request) => {
    const body = ingestSchema.parse(request.body || {});

    const tokenAddress = "DevToken" + randomUUID().replace(/-/g, "").slice(0, 30);
    const deployerAddress = "DevDeployer" + randomUUID().replace(/-/g, "").slice(0, 29);

    const result = await runIngestionPipeline({
      tokenAddress,
      symbol: body.symbol,
      name: body.name,
      decimals: 9,
      deployer: deployerAddress,
      initialLiquidity: body.initialLiquidity,
      timestamp: new Date().toISOString(),
    });

    log.info({ tokenAddress, eventId: result.eventId, processing: result.processing, delivery: result.delivery }, "Development event queued");

    return {
      success: true,
      data: {
        tokenAddress,
        eventId: result.eventId,
        processing: result.processing,
        delivery: result.delivery,
      },
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };
  });
};
