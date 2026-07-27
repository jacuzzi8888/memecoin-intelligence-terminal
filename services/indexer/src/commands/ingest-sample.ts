import { randomUUID } from "crypto";
import { logger } from "@memecoin/logger";
import { runIngestionPipeline } from "../pipeline.js";

const log = logger("ingest-sample");

async function main() {
  log.info("Starting development event ingestion...");

  const tokenAddress = "DevToken" + randomUUID().replace(/-/g, "").slice(0, 30);
  const deployerAddress = "DevDeployer" + randomUUID().replace(/-/g, "").slice(0, 29);

  log.info({ tokenAddress }, "Creating development token launch event");

  const result = await runIngestionPipeline({
    tokenAddress,
    symbol: "DEVTK",
    name: "Development Token",
    decimals: 9,
    deployer: deployerAddress,
    initialLiquidity: 15000,
    timestamp: new Date().toISOString(),
  });

  log.info(
    { tokenAddress, eventId: result.eventId, processing: result.processing, delivery: result.delivery },
    "Development event queued through shared ingestion pipeline",
  );
}

main().catch((err) => {
  log.error({ error: err }, "Ingestion failed");
  process.exit(1);
});
