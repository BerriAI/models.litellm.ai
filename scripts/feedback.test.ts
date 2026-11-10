import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { createFeedbackHandler } from "../api/feedback";
import { installFeedback } from "../public/feedback.js";

const request = (body: unknown, origin = "https://example.com") =>
  new Request("https://example.com/api/feedback", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("feedback delivery", () => {
  let POST: ReturnType<typeof createFeedbackHandler>;
  beforeEach(() => {
    POST = createFeedbackHandler();
  });
  it("does not report success when the destination is unconfigured", async () => {
    vi.stubEnv("FEEDBACK_WEBHOOK_URL", "");
    expect(
      (
        await POST(
          request({ message: "Add provider filters", page: "/models" }),
        )
      ).status,
    ).toBe(503);
  });
  it("rejects empty feedback, malformed payloads, and cross-origin submissions before forwarding", async () => {
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    for (const body of [
      null,
      {},
      { message: "  ", page: "/" },
      { message: "x".repeat(5001), page: "/" },
      { message: "hello", page: "/?private=value" },
      { message: "hello", page: "/", purpose: 123 },
      { message: "hello", page: "/", purpose: "x".repeat(1001) },
      { message: "hello", page: "/", contact: 123 },
      { message: "hello", page: "/", contact: "x".repeat(501) },
    ]) {
      expect((await createFeedbackHandler()(request(body))).status).toBe(400);
    }
    expect(
      (
        await POST(
          request({ message: "hello", page: "/" }, "https://other.example.com"),
        )
      ).status,
    ).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });
  it.each([undefined, "", " person@example.com ", "X: @example"])(
    "forwards feedback with optional contact %s",
    async (contact) => {
      vi.stubEnv(
        "FEEDBACK_WEBHOOK_URL",
        "https://hooks.zapier.com/example-not-a-real-webhook",
      );
      const send = vi.fn().mockResolvedValue(new Response("accepted"));
      vi.stubGlobal("fetch", send);
      const res = await POST(
        request({
          message: " Add provider filters ",
          page: "/models",
          email: "ignored@example.com",
          purpose: contact ? " Compare model prices " : undefined,
          contact,
        }),
      );
      expect(await res.json()).toEqual({ ok: true });
      expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({
        type: "models_feedback",
        message: "Add provider filters",
        purpose: contact ? "Compare model prices" : "",
        contact: contact?.trim() ?? "",
        page: "/models",
        timestamp: expect.any(String),
      });
      expect(send.mock.calls[0][1].redirect).toBe("error");
    },
  );
  it("does not confirm delivery after an upstream rejection or timeout", async () => {
    vi.stubEnv(
      "FEEDBACK_WEBHOOK_URL",
      "https://hooks.zapier.com/example-not-a-real-webhook",
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("rejected", { status: 500 }))
        .mockRejectedValueOnce(new Error("timeout")),
    );
    expect((await POST(request({ message: "hello", page: "/" }))).status).toBe(
      502,
    );
    expect((await POST(request({ message: "hello", page: "/" }))).status).toBe(
      502,
    );
  });
});

describe("feedback rate limits", () => {
  let time: number;
  let post: ReturnType<typeof createFeedbackHandler>;
  let send: ReturnType<typeof vi.fn>;
  const submit = (
    ip?: string,
    header = "x-vercel-forwarded-for",
    body: unknown = { message: "hello", page: "/" },
  ) => {
    const req = request(body);
    if (ip !== undefined) req.headers.set(header, ip);
    return post(req);
  };
  beforeEach(() => {
    time = 0;
    post = createFeedbackHandler(() => time);
    vi.stubEnv(
      "FEEDBACK_WEBHOOK_URL",
      "https://hooks.zapier.com/example-not-a-real-webhook",
    );
    send = vi.fn().mockResolvedValue(new Response("accepted"));
    vi.stubGlobal("fetch", send);
  });
  it("limits one IP for ten minutes without blocking another IP", async () => {
    for (let i = 0; i < 3; i++)
      expect((await submit("192.0.2.1")).status).toBe(200);
    const limited = await submit("192.0.2.1");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("600");
    expect(send).toHaveBeenCalledTimes(3);
    expect((await submit("192.0.2.2")).status).toBe(200);
    time = 600_000;
    expect((await submit("192.0.2.1")).status).toBe(200);
  });
  it("limits an IP to ten attempts per rolling day and expires old entries", async () => {
    for (let i = 0; i < 10; i++) {
      time = i * 600_000;
      expect((await submit("192.0.2.1")).status).toBe(200);
    }
    const limited = await submit("192.0.2.1");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("81000");
    time = 86_400_000;
    expect((await submit("192.0.2.1")).status).toBe(200);
  });
  it("caps all clients at thirty attempts per rolling hour", async () => {
    for (let i = 0; i < 30; i++)
      expect((await submit(`192.0.2.${i}`)).status).toBe(200);
    const limited = await submit("198.51.100.1");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("3600");
    expect(send).toHaveBeenCalledTimes(30);
    time = 3_600_000;
    expect((await submit("198.51.100.1")).status).toBe(200);
  });
  it.each(["x-forwarded-for", "x-real-ip"])(
    "falls back to %s and uses only the first IP",
    async (header) => {
      for (let i = 0; i < 3; i++)
        expect(
          (await submit(`192.0.2.1, 192.0.2.${i + 2}`, header)).status,
        ).toBe(200);
      expect((await submit("192.0.2.1", header)).status).toBe(429);
    },
  );
  it("prefers the Vercel IP over other headers", async () => {
    for (let i = 0; i < 4; i++) {
      const req = request({ message: "hello", page: "/" });
      req.headers.set("x-vercel-forwarded-for", "192.0.2.1");
      req.headers.set("x-forwarded-for", `198.51.100.${i}`);
      req.headers.set("x-real-ip", `203.0.113.${i}`);
      expect((await post(req)).status).toBe(i < 3 ? 200 : 429);
    }
  });
  it("shares an unknown bucket and counts invalid payloads without forwarding them", async () => {
    for (let i = 0; i < 3; i++)
      expect((await submit(undefined, undefined, null)).status).toBe(400);
    expect((await submit()).status).toBe(429);
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects origin and content type before consuming quota", async () => {
    for (let i = 0; i < 4; i++) {
      expect(
        (await post(request({}, "https://other.example.com"))).status,
      ).toBe(403);
      const req = request({});
      req.headers.set("content-type", "text/plain");
      expect((await post(req)).status).toBe(415);
    }
    expect((await submit()).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("feedback modal", () => {
  function setup(send: typeof fetch) {
    const window = new Window({
      url: "https://example.com/models/test?private=excluded",
    });
    const doc = window.document;
    doc.body.innerHTML = "<button data-feedback-open>Give feedback</button>";
    installFeedback(doc, send);
    const opener = doc.querySelector("button")!;
    opener.click();
    return {
      window,
      doc,
      opener,
      dialog: doc.querySelector("dialog")!,
      form: doc.querySelector("form")!,
      message: doc.querySelector("textarea")!,
      purpose: doc.querySelector<HTMLInputElement>('[name="purpose"]')!,
      contact: doc.querySelector<HTMLInputElement>('[name="contact"]')!,
    };
  }
  it("shows a rate limit message, retains the draft, and tracks a safe failure reason", async () => {
    const { window, doc, form, message } = setup(
      vi.fn().mockResolvedValue(new Response("limited", { status: 429 })),
    );
    const track = vi.fn();
    Object.assign(window, { litellmTrack: track });
    message.value = "Private feedback";
    form.dispatchEvent(new window.Event("submit", { cancelable: true }));
    await vi.waitFor(() =>
      expect(doc.querySelector('[role="status"]')?.textContent).toContain(
        "Too many submissions, try again later",
      ),
    );
    expect(message.value).toBe("Private feedback");
    expect(form.hidden).toBe(false);
    expect(
      doc.querySelector<HTMLButtonElement>('[type="submit"]')?.disabled,
    ).toBe(false);
    expect(track).toHaveBeenCalledWith("Feedback Failed", {
      page: "/models/test",
      reason: "rate_limited",
      status: 429,
    });
    await window.happyDOM.close();
  });
  it("keeps the draft on failure and sends no query parameters", async () => {
    const send = vi
      .fn()
      .mockResolvedValue(new Response("unavailable", { status: 503 }));
    const { window, doc, form, message, contact, purpose } = setup(send);
    message.value = "Please add provider filters";
    purpose.value = " Compare providers ";
    contact.value = " X: @example ";
    form.dispatchEvent(new window.Event("submit", { cancelable: true }));
    await vi.waitFor(() =>
      expect(doc.querySelector('[role="status"]')?.textContent).toContain(
        "Couldn’t send",
      ),
    );
    expect(message.value).toBe("Please add provider filters");
    expect(contact.value).toBe(" X: @example ");
    expect(purpose.value).toBe(" Compare providers ");
    expect(purpose.readOnly).toBe(false);
    expect(contact.readOnly).toBe(false);
    expect(form.hidden).toBe(false);
    expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({
      message: message.value,
      purpose: "Compare providers",
      contact: "X: @example",
      page: "/models/test",
    });
    await window.happyDOM.close();
  });
  it("prevents duplicate submissions and confirms only a successful JSON acknowledgement", async () => {
    let resolve!: (response: Response) => void;
    const send = vi.fn().mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );
    const { window, doc, form, message, contact, purpose } = setup(send);
    message.value = "Add providers";
    contact.value = "person@example.com";
    purpose.value = "Find an image model";
    form.dispatchEvent(new window.Event("submit", { cancelable: true }));
    form.dispatchEvent(new window.Event("submit", { cancelable: true }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(contact.required).toBe(false);
    expect(purpose.required).toBe(false);
    expect(purpose.readOnly).toBe(true);
    expect(contact.readOnly).toBe(true);
    expect(
      doc.querySelector<HTMLButtonElement>('[type="submit"]')?.disabled,
    ).toBe(true);
    resolve(Response.json({ ok: true }));
    await vi.waitFor(() => expect(form.hidden).toBe(true));
    expect(message.value).toBe("");
    expect(contact.value).toBe("");
    expect(purpose.value).toBe("");
    expect(doc.querySelector<HTMLElement>(".feedback-success")?.hidden).toBe(
      false,
    );
    await window.happyDOM.close();
  });
  it("retains text across dismissal and reopening", async () => {
    const { window, doc, message, contact, opener, dialog } = setup(vi.fn());
    message.value = "A draft";
    contact.value = "X: @example";
    doc.querySelector<HTMLButtonElement>(".feedback-close")!.click();
    expect(dialog.open).toBe(false);
    opener.click();
    expect(dialog.open).toBe(true);
    expect(message.value).toBe("A draft");
    expect(contact.value).toBe("X: @example");
    await window.happyDOM.close();
  });
});
