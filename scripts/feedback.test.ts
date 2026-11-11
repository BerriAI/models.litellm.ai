import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../api/feedback";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("retired feedback endpoint", () => {
  it.each(["", "https://example.com/retired-webhook"])(
    "rejects submissions without forwarding when webhook configuration is %j",
    async (destination) => {
      vi.stubEnv("FEEDBACK_WEBHOOK_URL", destination);
      const send = vi.fn();
      vi.stubGlobal("fetch", send);
      const request = new Request("https://example.com/api/feedback", {
        method: "POST",
        headers: {
          origin: "https://example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Test submission", page: "/models" }),
      });

      const response = await POST(request);

      expect(response.status).toBe(410);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ ok: false });
      expect(request.bodyUsed).toBe(false);
      expect(send).not.toHaveBeenCalled();
    },
  );
});
