import { randomUUID } from "crypto";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { logger } from "@memecoin/logger";

const log = logger("indexer");

export interface RawTokenEvent {
  tokenAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  deployer: string;
  initialLiquidity: number;
  timestamp: string;
}

export async function ingestRawTokenEvent(event: RawTokenEvent): Promise<string> {
  const db = getDb();
  const eventId = randomUUID();

  log.info({ eventId, tokenAddress: event.tokenAddress }, "Ingesting raw token event");

  await db.insert(schema.rawProviderEvents).values({
    id: eventId,
    provider: "development",
    eventType: "token_launch",
    rawJson: event as unknown as Record<string, unknown>,
    txSignature: `dev-tx-${eventId.slice(0, 8)}`,
    processingStatus: "pending",
  });

  log.info({ eventId }, "Raw token event stored");
  return eventId;
}

export async function runIngestionPipeline(event: RawTokenEvent): Promise<{ eventId: string }> {
  const eventId = await ingestRawTokenEvent(event);
  return { eventId };
}
