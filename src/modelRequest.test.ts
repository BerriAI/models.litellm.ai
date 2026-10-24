import { describe, expect, test, vi } from "vitest";
import { submitModelRequest } from "./modelRequest";

describe("model requests", () => {
  test("should submit a trimmed model name without requiring email", async () => {
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("ok"));
    await expect(
      submitModelRequest("  example-model  ", fetchRequest),
    ).resolves.toBe("confirmed");
    const [, options] = fetchRequest.mock.calls[0];
    expect(options).toMatchObject({ method: "POST", mode: "no-cors" });
    expect(JSON.parse(options!.body as string)).toMatchObject({
      type: "model",
      request: "example-model",
      email: "",
      docsLink: "",
      deadline: "",
      willingToCall: false,
    });
  });

  test("should not claim receipt when the webhook response is opaque", async () => {
    const opaqueResponse = new Response(null);
    Object.defineProperty(opaqueResponse, "type", { value: "opaque" });
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(opaqueResponse);
    await expect(
      submitModelRequest("example-model", fetchRequest),
    ).resolves.toBe("unconfirmed");
    expect(fetchRequest).toHaveBeenCalledTimes(1);
  });

  test.each(["", "   ", "x".repeat(301)])(
    "should reject an invalid model name before sending",
    async (name) => {
      const fetchRequest = vi.fn<typeof fetch>();
      await expect(submitModelRequest(name, fetchRequest)).rejects.toThrow();
      expect(fetchRequest).not.toHaveBeenCalled();
    },
  );

  test("should preserve a webhook failure instead of reporting success", async () => {
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      submitModelRequest("example-model", fetchRequest),
    ).rejects.toThrow("not accepted");
  });

  test("should surface a network failure without automatically sending again", async () => {
    const fetchRequest = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      submitModelRequest("example-model", fetchRequest),
    ).rejects.toThrow("Failed to fetch");
    expect(fetchRequest).toHaveBeenCalledTimes(1);
  });
});
