import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

import { logger } from "@memecoin/logger";
import { startTransactionStreamIngestion } from "../stream-ingestion.js";

const log = logger("stream-transactions");

startTransactionStreamIngestion().catch((error) => {
  log.error({ error }, "Transaction stream ingestion failed");
  process.exit(1);
});
