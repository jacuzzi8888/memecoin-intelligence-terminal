const DEFAULT_INTERVAL_MS = 650;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 1_500;

interface HeliusFetchOptions {
  intervalMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
}

let requestGate = Promise.resolve();
let nextRequestAt = 0;

function nonNegativeNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function waitForRequestSlot(intervalMs: number) {
  let release: (() => void) | undefined;
  const previous = requestGate;
  requestGate = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    await sleep(Math.max(0, nextRequestAt - Date.now()));
    nextRequestAt = Date.now() + intervalMs;
  } finally {
    release?.();
  }
}

function getRetryDelay(response: Response | null, attempt: number, retryBaseMs: number) {
  const retryAfter = response?.headers.get("retry-after");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1_000;
  }
  return retryBaseMs * Math.pow(2, attempt);
}

export async function fetchHelius(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
  options: HeliusFetchOptions = {},
) {
  const intervalMs = options.intervalMs
    ?? nonNegativeNumber(process.env.HELIUS_REQUEST_INTERVAL_MS, DEFAULT_INTERVAL_MS);
  const maxRetries = options.maxRetries
    ?? nonNegativeNumber(process.env.HELIUS_REQUEST_MAX_RETRIES, DEFAULT_MAX_RETRIES);
  const retryBaseMs = options.retryBaseMs
    ?? nonNegativeNumber(process.env.HELIUS_REQUEST_RETRY_BASE_MS, DEFAULT_RETRY_BASE_MS);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await waitForRequestSlot(intervalMs);

    let response: Response | null = null;
    try {
      response = await fetch(input, init);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === maxRetries) return response;
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (attempt === maxRetries) throw error;
    }

    await sleep(getRetryDelay(response, attempt, retryBaseMs));
  }

  throw new Error("Helius request retry loop exited unexpectedly");
}

export function resetHeliusRequestLimiterForTests() {
  requestGate = Promise.resolve();
  nextRequestAt = 0;
}
