import { describe, it, expect, afterEach, vi } from "vitest";
import { RateLimiter, getClientIp } from "@/lib/rate-limit";

function requestWithHeaders(headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/prompts", { headers });
}

describe("getClientIp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should ignore forwarded headers when TRUST_PROXY is not set", () => {
    vi.stubEnv("TRUST_PROXY", "");
    const request = requestWithHeaders({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" });

    expect(getClientIp(request)).toBeNull();
  });

  it("should use the last X-Forwarded-For entry when TRUST_PROXY is enabled", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    const request = requestWithHeaders({ "x-forwarded-for": "6.6.6.6, 10.0.0.1, 203.0.113.7" });

    expect(getClientIp(request)).toBe("203.0.113.7");
  });

  it("should fall back to X-Real-IP when X-Forwarded-For is missing", () => {
    vi.stubEnv("TRUST_PROXY", "1");
    const request = requestWithHeaders({ "x-real-ip": " 198.51.100.2 " });

    expect(getClientIp(request)).toBe("198.51.100.2");
  });

  it("should return null when no IP header is present", () => {
    vi.stubEnv("TRUST_PROXY", "true");

    expect(getClientIp(requestWithHeaders({}))).toBeNull();
  });
});

describe("RateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should block requests over the limit and allow them after the window", () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({ max: 2, windowSeconds: 60 });

    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);

    const blocked = limiter.check("ip");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBe(60);
    }

    expect(limiter.check("other-ip").allowed).toBe(true);

    vi.advanceTimersByTime(60_001);
    expect(limiter.check("ip").allowed).toBe(true);
  });
});
