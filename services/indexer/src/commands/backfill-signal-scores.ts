import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { closeDb } from "@memecoin/database";
import { logger } from "@memecoin/logger";
import { backfillSignalScores } from "../signal-score-backfill.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

const log = logger("backfill-signal-scores");

function readNumberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const result = await backfillSignalScores({
    limit: readNumberEnv("SIGNAL_SCORE_BACKFILL_LIMIT", 2000),
    sinceDays: readNumberEnv("SIGNAL_SCORE_BACKFILL_SINCE_DAYS", 7),
    dryRun: process.env.SIGNAL_SCORE_BACKFILL_DRY_RUN === "true",
  });

  log.info(result, "Signal score backfill finished");
}

main()
  .catch((error) => {
    log.error({ error }, "Signal score backfill failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
