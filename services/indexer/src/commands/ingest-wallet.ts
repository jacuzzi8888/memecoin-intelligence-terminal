import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

import { logger } from "@memecoin/logger";
import { closeDb } from "@memecoin/database";
import { runWalletIntelligencePipeline } from "../wallet-pipeline.js";

const log = logger("ingest-wallet");

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const walletAddress = args[0];

  if (!walletAddress) {
    console.error("Usage: pnpm ingest-wallet <wallet-address>");
    process.exit(1);
  }

  const result = await runWalletIntelligencePipeline(walletAddress);
  log.info(result, "Wallet history ingestion complete through shared wallet pipeline");
}

main()
  .then(() => closeDb())
  .catch((err) => {
    log.error({ error: err instanceof Error ? err.message : err }, "Wallet history ingestion failed");
    return closeDb().finally(() => process.exit(1));
  });
