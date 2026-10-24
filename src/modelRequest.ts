export type RequestDelivery = "confirmed" | "unconfirmed";

const REQUEST_WEBHOOK =
  "https://hooks.zapier.com/hooks/catch/16331268/uwas519/";

/** Keep the existing webhook contract; opaque responses cannot confirm receipt. */
export async function submitModelRequest(
  modelName: string,
  fetchRequest: typeof fetch = fetch,
): Promise<RequestDelivery> {
  const request = modelName.trim();
  if (!request) throw new Error("Enter a model name.");
  if (request.length > 300)
    throw new Error("Model names must be 300 characters or fewer.");
  const response = await fetchRequest(REQUEST_WEBHOOK, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({
      type: "model",
      request,
      docsLink: "",
      email: "",
      deadline: "",
      willingToCall: false,
      timestamp: new Date().toISOString(),
    }),
  });
  if (response.type === "opaque") return "unconfirmed";
  if (!response.ok)
    throw new Error("The request was not accepted. Please try again later.");
  return "confirmed";
}
