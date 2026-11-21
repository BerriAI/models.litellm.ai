type VoiceProtocol =
  | "live"
  | "transcription"
  | "translation"
  | "realtime"
  | "provider";

export type VoiceUsage = {
  protocol: VoiceProtocol;
  endpoint?: string;
  guide: string;
  hasExample: boolean;
};

const DOCS = "https://docs.litellm.ai/docs";
const REALTIME = "/v1/realtime";
const LIVE = "/v1/live/sessions";
const TRANSLATION = "/v1/realtime/translations";
const PROVIDER_GUIDES: Record<string, string> = {
  xai: "/providers/xai_realtime",
  gemini: "/providers/google_ai_studio/realtime",
  vertex_ai: "/providers/vertex_realtime",
  bedrock: "/providers/bedrock_realtime_with_audio",
};

export function getVoiceUsage({
  mode,
  litellm_provider,
  supported_endpoints,
}: {
  mode?: string;
  litellm_provider?: string;
  supported_endpoints?: unknown;
}): VoiceUsage | undefined {
  const endpoints: unknown[] = Array.isArray(supported_endpoints)
    ? supported_endpoints
    : [];
  const openAIProtocol =
    litellm_provider === "openai" || litellm_provider === "azure";

  if (endpoints.includes(LIVE)) {
    return {
      protocol: "live",
      endpoint: LIVE,
      guide: `${DOCS}/live_sessions`,
      hasExample: true,
    };
  }
  if (endpoints.includes(TRANSLATION)) {
    return {
      protocol: "translation",
      endpoint: TRANSLATION,
      guide: `${DOCS}/realtime_translation`,
      hasExample: false,
    };
  }
  if (
    mode === "audio_transcription" &&
    endpoints.includes(REALTIME) &&
    !endpoints.includes("/v1/audio/transcriptions")
  ) {
    return {
      protocol: "transcription",
      endpoint: `${REALTIME}?intent=transcription`,
      guide: openAIProtocol
        ? `${DOCS}/realtime#live-transcription-with-gpt-live-transcribe`
        : `${DOCS}/voice#provider-guides`,
      hasExample: openAIProtocol,
    };
  }
  if (mode !== "realtime") return undefined;

  if (openAIProtocol && (endpoints.includes(REALTIME) || !endpoints.length)) {
    return {
      protocol: "realtime",
      endpoint: REALTIME,
      guide: `${DOCS}/realtime`,
      hasExample: true,
    };
  }
  return {
    protocol: "provider",
    endpoint: endpoints.includes(REALTIME) ? REALTIME : undefined,
    guide:
      DOCS +
      (PROVIDER_GUIDES[litellm_provider?.split("-")[0] ?? ""] ??
        "/voice#provider-guides"),
    hasExample: false,
  };
}

export function getVoiceWebSocketSnippet(
  usage: VoiceUsage,
  alias: string,
  model: string,
): string | undefined {
  if (!usage.hasExample || !usage.endpoint) return undefined;

  const params = new URLSearchParams();
  if (usage.protocol !== "live") params.set("model", alias);
  if (usage.protocol === "transcription") params.set("intent", "transcription");
  const url = `ws://localhost:4000${usage.endpoint.split("?")[0]}${params.size ? `?${params}` : ""}`;

  let imports = "";
  let preparation = "";
  let exchange = `        await ws.send(json.dumps({
            "type": "response.create",
            "response": {
                "output_modalities": ["text"],
                "instructions": "Say hello in one sentence.",
            },
        }))
        async for message in ws:
            event = json.loads(message)
            if event["type"] == "response.output_text.delta":
                print(event["delta"], end="", flush=True)
            if event["type"] == "error":
                raise RuntimeError(event)
            if event["type"] == "response.done":
                print()
                break`;
  if (usage.protocol === "live") {
    exchange = `        await ws.send(json.dumps({
            "type": "session.start",
            "session": {"model": ${JSON.stringify(alias)}},
        }))
        async for message in ws:
            event = json.loads(message)
            print(event)
            if event["type"] == "session.started":
                await ws.send(json.dumps({"type": "session.close"}))
            if event["type"] in ("session.closed", "error"):
                break`;
  } else if (usage.protocol === "transcription") {
    imports = "import base64\n";
    preparation =
      "# Convert an audio file first: ffmpeg -i speech.wav -f s16le -ar 24000 -ac 1 speech.pcm\n";
    exchange = `        await ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "type": "transcription",
                "audio": {"input": {
                    "format": {"type": "audio/pcm", "rate": 24000},
                    "transcription": {"model": ${JSON.stringify(model.split("/").pop())}},
                    "turn_detection": None,
                }},
            },
        }))
        with open("speech.pcm", "rb") as audio:
            while chunk := audio.read(4800):
                await ws.send(json.dumps({
                    "type": "input_audio_buffer.append",
                    "audio": base64.b64encode(chunk).decode(),
                }))
        await ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
        async for message in ws:
            event = json.loads(message)
            if event["type"] == "conversation.item.input_audio_transcription.completed":
                print(event["transcript"])
                break
            if event["type"] in ("conversation.item.input_audio_transcription.failed", "error"):
                raise RuntimeError(event)`;
  }

  return `# pip install "websockets>=14"
${preparation}import asyncio
${imports}import json
import os

import websockets


async def main():
    headers = {"Authorization": f"Bearer {os.environ['LITELLM_API_KEY']}"}
    async with websockets.connect(${JSON.stringify(url)}, additional_headers=headers) as ws:
${exchange}


asyncio.run(main())`;
}
