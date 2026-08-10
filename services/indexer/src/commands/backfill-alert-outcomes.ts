import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { closeDb } from "@memecoin/database";
import { logger } from "@memecoin/logger";
import { backfillAlertOutcomes } from "../alert-outcomes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

const log = logger("backfill-alert-outcomes");

function readNumberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const result = await backfillAlertOutcomes({
    limit: readNumberEnv("ALERT_OUTCOME_LIMIT", 200),
    sinceDays: readNumberEnv("ALERT_OUTCOME_SINCE_DAYS", 7),
  });

  log.info(result, "Alert outcome backfill finished");
}

main()
  .catch((error) => {
    log.error({ error }, "Alert outcome backfill failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
