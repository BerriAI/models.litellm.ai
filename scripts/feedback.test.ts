import { afterEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { POST } from "../api/feedback";
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
      expect((await POST(request(body))).status).toBe(400);
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
