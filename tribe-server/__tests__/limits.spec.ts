import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/limits.ts";

describe("RateLimiter", () => {
  it("allows a burst, then refills over time", () => {
    let now = 0;
    const limiter = new RateLimiter(3, 1, () => now);
    expect([1, 2, 3, 4].map(() => limiter.take("ip"))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    now = 1000;
    expect(limiter.take("ip")).toBe(true);
    expect(limiter.take("ip")).toBe(false);
    // other keys have their own bucket
    expect(limiter.take("other")).toBe(true);
  });

  it("charges expensive events more", () => {
    const limiter = new RateLimiter(10, 1, () => 0);
    expect(limiter.take("socket", 10)).toBe(true);
    expect(limiter.take("socket", 1)).toBe(false);
  });

  it("forgets full buckets", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1, () => now);
    limiter.take("ip");
    limiter.take("ip");
    now = 5000;
    limiter.prune();
    // a pruned key starts again with a full bucket
    expect(limiter.take("ip")).toBe(true);
    expect(limiter.take("ip")).toBe(true);
    expect(limiter.take("ip")).toBe(false);
  });
});
