import { logger } from "@memecoin/logger";
const log = logger("scoring");
log.info("Scoring service ready");
export { calculateSignalScore } from "@memecoin/intelligence";