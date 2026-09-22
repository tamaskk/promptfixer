/**
 * In-memory sliding window rate limiter.
 *
 * Each limiter instance tracks request timestamps per identifier (IP or API key)
 * and rejects requests that exceed the configured window/max.
 *
 * NOTE: This is per-process. In a multi-instance deployment, consider a
 * Redis-backed implementation instead.
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimiterOptions {
  /** Maximum number of requests allowed within the window. */
  max: number;
  /** Time window in seconds. */
  windowSeconds: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly max: number;
  private readonly windowMs: number;
  // Cleanup stale entries every 60 s to prevent memory leaks
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(opts: RateLimiterOptions) {
    this.max = opts.max;
    this.windowMs = opts.windowSeconds * 1000;
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    // Allow the process to exit without waiting for the interval
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Check whether the given identifier is allowed to make a request.
   * Returns `{ allowed: true, remaining }` or `{ allowed: false, retryAfterSeconds }`.
   */
  check(identifier: string): { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    let entry = this.store.get(identifier);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(identifier, entry);
    }

    // Drop timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    if (entry.timestamps.length >= this.max) {
      // Earliest timestamp that will leave the window
      const oldest = entry.timestamps[0];
      const retryAfterMs = oldest + this.windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
    }

    entry.timestamps.push(now);
    return { allowed: true, remaining: this.max - entry.timestamps.length };
  }

  private cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [key, entry] of this.store) {
      entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pre-configured limiters for MCP tool calls
// ---------------------------------------------------------------------------

/** General MCP POST requests – 20 req / min per identifier */
export const mcpGeneralLimiter = new RateLimiter({ max: 20, windowSeconds: 60 });

/** tool calls (tools/call) – 10 req / min per identifier */
export const mcpToolCallLimiter = new RateLimiter({ max: 10, windowSeconds: 60 });

/** Write-mutation tools – 5 req / min per identifier */
export const mcpWriteToolLimiter = new RateLimiter({ max: 5, windowSeconds: 60 });

/** AI-powered tools (improve_prompt) – 2 req / min per identifier */
export const mcpAiToolLimiter = new RateLimiter({ max: 2, windowSeconds: 60 });

// ---------------------------------------------------------------------------
// Public API rate limiting
// ---------------------------------------------------------------------------

/** Public REST API (GET /api/prompts) – 60 req / min per client IP */
export const publicApiLimiter = new RateLimiter({ max: 60, windowSeconds: 60 });

/**
 * Resolve the client IP from proxy headers.
 *
 * Forwarded headers are client-controlled unless a reverse proxy overwrites
 * them, so they are only trusted when TRUST_PROXY is enabled. Returns null
 * when no trustworthy IP is available — callers should skip IP-based limiting
 * rather than lump every client into one shared bucket.
 */
export function getClientIp(request: Request): string | null {
  const trustProxy = process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "1";
  if (!trustProxy) return null;

  // The last X-Forwarded-For entry is the one appended by our own proxy;
  // earlier entries can be forged by the client.
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const last = forwardedFor.split(",").map((ip) => ip.trim()).filter(Boolean).pop();
    if (last) return last;
  }

  return request.headers.get("x-real-ip")?.trim() || null;
}
