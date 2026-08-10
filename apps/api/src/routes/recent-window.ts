export const DEFAULT_RECENT_DAYS = 1;

export function getRecentWindow(days = DEFAULT_RECENT_DAYS) {
  const safeDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_RECENT_DAYS;
  return new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
}

export function serializeRecentWindow(since: Date) {
  return {
    since: since.toISOString(),
    days: Math.max(1, Math.round((Date.now() - since.getTime()) / (24 * 60 * 60 * 1000))),
  };
}
