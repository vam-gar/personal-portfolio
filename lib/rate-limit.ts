// Best-effort in-memory sliding-window rate limit, keyed by client IP.
// State lives in one server instance's memory: it resets on cold start and
// is not shared across serverless instances, so it slows casual abuse
// rather than guaranteeing a global cap.

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const MAX_TRACKED_IPS = 5000;

const hits = new Map<string, number[]>();

export function rateLimit(ip: string, now = Date.now()): { ok: boolean; retryAfterSecs: number } {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    hits.set(ip, recent);
    return { ok: false, retryAfterSecs: Math.ceil((recent[0] + WINDOW_MS - now) / 1000) };
  }
  recent.push(now);
  hits.set(ip, recent);

  if (hits.size > MAX_TRACKED_IPS) {
    hits.forEach((times, key) => {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    });
  }
  return { ok: true, retryAfterSecs: 0 };
}
