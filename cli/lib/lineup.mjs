// Editorial size buckets from the requested lineup. LiteLLM does not assign tiers.
// Resolve exact catalog IDs so missing or retired models never become invented rows.
const LINEUP = [
  {
    lab: "Google",
    family: "Gemini 4",
    tiers: { l: [["gemini-4-argon", "Argon"]] },
  },
  {
    lab: "Google",
    family: "Gemini 4",
    tiers: {
      l: [["gemini-4-carbon", "Carbon"]],
      mp: [["gemini-4-neon", "Neon"]],
      m: [["gemini-4-hydrogen", "Hydrogen"]],
    },
  },
  {
    lab: "Anthropic",
    family: "Claude 5.2",
    tiers: {
      xl: [
        ["claude-fable-5-2", "Fable"],
        ["claude-mythos-5-2", "Mythos"],
      ],
    },
  },
  {
    lab: "Anthropic",
    family: "Claude 5.5",
    tiers: {
      l: [["claude-opus-5-5", "Opus"]],
      m: [["claude-sonnet-5-5", "Sonnet"]],
      s: [["claude-haiku-5-5", "Haiku"]],
    },
  },
  {
    lab: "OpenAI",
    family: "GPT 6.2",
    tiers: {
      xl: [["gpt-6.2-astra", "Astra"]],
      l: [["gpt-6.2-sol", "Sol"]],
    },
  },
  {
    lab: "OpenAI",
    family: "GPT 6.1",
    tiers: { m: [["gpt-6.1-terra", "Terra"]] },
  },
  { lab: "OpenAI", family: "GPT 6", tiers: { s: [["gpt-6-luna", "Luna"]] } },
];

export const TIERS = [
  { key: "xl", label: "XL" },
  { key: "l", label: "L" },
  { key: "mp", label: "M+" },
  { key: "m", label: "M" },
  { key: "s", label: "S/XS" },
];

export function buildLineup(models) {
  const byId = new Map(models.map((model) => [model.id, model]));
  return LINEUP.map((row) => ({
    lab: row.lab,
    family: row.family,
    tiers: Object.fromEntries(
      TIERS.map(({ key }) => [
        key,
        (row.tiers[key] || []).flatMap(([id, label]) => {
          const model = byId.get(id);
          return model?.lab === row.lab ? [{ label, model }] : [];
        }),
      ]),
    ),
  })).filter((row) =>
    Object.values(row.tiers).some((entries) => entries.length),
  );
}
