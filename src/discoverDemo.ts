/** Design fixtures only. These are not measured benchmark results or recommendations. */
export type WorkloadId = "extract" | "support" | "code" | "search";
export type DatasetSource = "public" | "private";
export type ModelId = "kimi" | "sol" | "sonnet" | "argon" | "luna";
export type Result = [quality: number, seconds: number, costPerAttempt: number];

export const demoModels: {
  id: ModelId;
  name: string;
  provider: string;
  providerName: string;
}[] = [
  {
    id: "kimi",
    name: "Kimi K3",
    provider: "moonshot",
    providerName: "Moonshot AI",
  },
  { id: "sol", name: "GPT-6 Sol", provider: "openai", providerName: "OpenAI" },
  {
    id: "sonnet",
    name: "Claude Sonnet 5.5",
    provider: "anthropic",
    providerName: "Anthropic",
  },
  {
    id: "argon",
    name: "Gemini 4 Argon",
    provider: "google",
    providerName: "Google",
  },
  {
    id: "luna",
    name: "GPT-6 Luna",
    provider: "openai",
    providerName: "OpenAI",
  },
];

export const demoWorkloads: Record<
  WorkloadId,
  {
    name: string;
    baseline: ModelId;
    floor: number;
    volume: number;
    sample: number;
    public: Result[];
    private: Result[];
  }
> = {
  extract: {
    name: "Extraction",
    baseline: "sol",
    floor: 99,
    volume: 200000,
    sample: 1000,
    public: [
      [99.3, 1.8, 0.05],
      [99.4, 2.6, 0.11],
      [99.2, 2.4, 0.1],
      [98.8, 2, 0.075],
      [97.4, 1.2, 0.025],
    ],
    private: [
      [99.1, 1.9, 0.054],
      [99.2, 2.8, 0.12],
      [99, 2.5, 0.1],
      [98.7, 2.2, 0.08],
      [97.1, 1.3, 0.028],
    ],
  },
  support: {
    name: "Customer support",
    baseline: "sonnet",
    floor: 96,
    volume: 100000,
    sample: 1000,
    public: [
      [96.7, 7.6, 0.074],
      [97.2, 8.8, 0.19],
      [97.1, 8, 0.175],
      [95.8, 7.2, 0.11],
      [92.1, 4.1, 0.039],
    ],
    private: [
      [92.4, 10.2, 0.078],
      [96.9, 9.1, 0.195],
      [96.8, 8.1, 0.18],
      [94.6, 7.9, 0.115],
      [89.7, 4.5, 0.042],
    ],
  },
  code: {
    name: "Coding agents",
    baseline: "sonnet",
    floor: 76,
    volume: 20000,
    sample: 100,
    public: [
      [79, 72, 0.95],
      [81, 80, 1.55],
      [80, 68, 1.6],
      [75, 62, 1.05],
      [58, 33, 0.24],
    ],
    private: [
      [76.5, 88, 1.34],
      [78, 85, 1.72],
      [77, 71, 1.6],
      [72, 69, 1.18],
      [54, 39, 0.28],
    ],
  },
  search: {
    name: "Search & RAG",
    baseline: "luna",
    floor: 97,
    volume: 200000,
    sample: 1000,
    public: [
      [98, 1.5, 0.016],
      [98.6, 2.3, 0.065],
      [98.3, 2.1, 0.06],
      [97.6, 1.7, 0.022],
      [97.8, 1.8, 0.027],
    ],
    private: [
      [97.6, 1.6, 0.018],
      [98.3, 2.6, 0.07],
      [98.1, 2.3, 0.064],
      [97.2, 1.9, 0.024],
      [97.4, 2, 0.03],
    ],
  },
};

export function estimateSpend(
  currentCost: number,
  candidateCost: number,
  quality: number,
  floor: number,
  volume: number,
) {
  const valid =
    Number.isFinite(currentCost) &&
    currentCost >= 0 &&
    Number.isFinite(candidateCost) &&
    candidateCost >= 0 &&
    Number.isFinite(quality) &&
    Number.isFinite(volume) &&
    volume > 0 &&
    Number.isFinite(floor) &&
    floor >= 0 &&
    floor <= 100;
  const current = valid ? currentCost * volume : 0;
  const candidate = valid ? candidateCost * volume : 0;
  return {
    valid,
    current,
    candidate,
    difference: current - candidate,
    eligible: valid && quality >= floor,
  };
}
