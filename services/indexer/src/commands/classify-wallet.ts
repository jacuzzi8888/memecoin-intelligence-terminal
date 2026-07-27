import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

import { logger } from "@memecoin/logger";
import { runWalletIntelligencePipeline } from "../wallet-pipeline.js";

const log = logger("classify-wallet");

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const walletAddress = args[0];

  if (!walletAddress) {
    console.error("Usage: pnpm classify-wallet <wallet-address>");
    process.exit(1);
  }

  const result = await runWalletIntelligencePipeline(walletAddress);
  log.info(result, "Wallet classification complete through shared wallet pipeline");
}

main().catch((err) => {
  log.error({ error: err }, "Wallet classification failed");
  process.exit(1);
});
