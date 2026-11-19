import { afterEach, beforeEach, expect, it, vi } from "vitest";

const check = vi.hoisted(() => vi.fn());
vi.mock("@vercel/firewall", () => ({ checkRateLimit: check }));
beforeEach(() => {
  vi.resetModules();
  check.mockReset().mockResolvedValue({ rateLimited: false });
  vi.stubEnv("VERCEL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("accepts first visitors and only reuses authentic, unexpired host cookies", async () => {
  const { visitorIdentity } = await import("../server/admission.js");
  const request = (cookie = "") =>
    new Request("https://models.example.com/api/ask", { headers: { cookie } });
  const now = 1_800_000_000_000;
  const first = visitorIdentity(request(), "dummy-key", now);
  const cookie = first.cookie!.split(";")[0];
  expect(first.cookie).toContain("__Host-models-ai=");
  expect(visitorIdentity(request(cookie), "dummy-key", now).id).toBe(first.id);
  expect(visitorIdentity(request(cookie), "other-dummy-key", now).id).not.toBe(
    first.id,
  );
  expect(
    visitorIdentity(request(cookie), "dummy-key", now + 86_401_000).id,
  ).not.toBe(first.id);
  expect(
    visitorIdentity(
      request(cookie.replace(first.id, "00000000-0000-0000-0000-000000000000")),
      "dummy-key",
      now,
    ).id,
  ).not.toBe(first.id);
});

it("limits a visitor without denying others and recovers after the cooldown", async () => {
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const { admitVisitor } = await import("../server/admission.js");
  for (let i = 0; i < 10; i++) {
    const permit = await admitVisitor("visitor-a");
    expect(permit).toHaveProperty("release");
    if ("release" in permit) permit.release();
  }
  expect(await admitVisitor("visitor-a")).toEqual({
    status: 429,
    retryAfter: 60,
  });
  const other = await admitVisitor("visitor-b");
  expect(other).toHaveProperty("release");
  if ("release" in other) other.release();
  now += 60_001;
  const recovered = await admitVisitor("visitor-a");
  expect(recovered).toHaveProperty("release");
  if ("release" in recovered) recovered.release();
});

it("allows two active questions per visitor and releases each permit once", async () => {
  const { admitVisitor } = await import("../server/admission.js");
  const first = await admitVisitor("visitor-a"),
    second = await admitVisitor("visitor-a");
  expect(await admitVisitor("visitor-a")).toEqual({
    status: 429,
    retryAfter: 3,
  });
  if ("release" in first) {
    first.release();
    first.release();
  }
  const third = await admitVisitor("visitor-a");
  expect(third).toHaveProperty("release");
  expect(await admitVisitor("visitor-a")).toHaveProperty("status", 429);
  if ("release" in second) second.release();
  if ("release" in third) third.release();
});

it("shares the visitor counter across module instances with a pinned, minimal firewall request", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "models.example.com");
  let calls = 0;
  check.mockImplementation(async () => ({ rateLimited: ++calls > 10 }));
  const first = await import("../server/admission.js");
  vi.resetModules();
  const second = await import("../server/admission.js");
  for (let i = 0; i < 10; i++) {
    const permit = await (i % 2 ? first : second).admitVisitor("same-visitor");
    expect(permit).toHaveProperty("release");
    if ("release" in permit) permit.release();
  }
  expect(await first.admitVisitor("same-visitor")).toEqual({
    status: 429,
    retryAfter: 60,
  });
  const [name, options] = check.mock.calls[0];
  expect(name).toBe("models-ai-visitor");
  expect(options.rateLimitKey).toBe("same-visitor");
  expect([...options.headers.entries()]).toEqual([
    ["host", "models.example.com"],
  ]);
  expect(options.timeout).toBe(1_000);
});

it("keeps first use available on shared-limiter failure while retaining local limits", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "models.example.com");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  check.mockRejectedValue(new Error("dummy-upstream-error"));
  const { admitVisitor } = await import("../server/admission.js");
  for (let i = 0; i < 10; i++) {
    const permit = await admitVisitor("visitor-a");
    expect(permit).toHaveProperty("release");
    if ("release" in permit) permit.release();
  }
  expect(await admitVisitor("visitor-a")).toHaveProperty("status", 429);
  expect(warn).toHaveBeenCalledOnce();
  expect(JSON.stringify(warn.mock.calls)).not.toContain("dummy-upstream-error");
});
