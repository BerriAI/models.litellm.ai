/** schema.org JSON-LD for model, provider and index pages. */
import type { PageCopy } from "./copy";
import type { ModelView } from "./model-view";
import { UNIT_LABEL } from "./pricing";
import { GITHUB_URL, SITE_NAME, SITE_URL, abs, modelPath } from "./site";

type Json = Record<string, unknown>;

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

export function siteNodes(): Json[] {
  return [
    {
      "@type": "Organization",
      "@id": ORG_ID,
      name: "LiteLLM",
      url: "https://www.litellm.ai",
      sameAs: [GITHUB_URL, "https://docs.litellm.ai"],
    },
    {
      "@type": "WebSite",
      "@id": SITE_ID,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      publisher: { "@id": ORG_ID },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ];
}

export function breadcrumb(items: { name: string; path: string }[]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: abs(item.path),
    })),
  };
}

export function webPage(path: string, title: string, description: string, dateModified: string, datePublished?: string): Json {
  return {
    "@type": "WebPage",
    "@id": `${abs(path)}#webpage`,
    url: abs(path),
    name: title,
    description,
    isPartOf: { "@id": SITE_ID },
    inLanguage: "en",
    dateModified,
    ...(datePublished ? { datePublished } : {}),
  };
}

function offers(v: ModelView): Json[] {
  const r = v.headline;
  if (!r) return [];
  const p = r.prices;
  const seller = { "@type": "Organization", name: r.providerName };
  const dims: [string, number | undefined, string][] = [
    ["Input price", p.input, UNIT_LABEL.per_1m_tokens],
    ["Output price", p.output, UNIT_LABEL.per_1m_tokens],
    ["Cache read price", p.cacheRead, UNIT_LABEL.per_1m_tokens],
    ["Cache write price", p.cacheWrite, UNIT_LABEL.per_1m_tokens],
    ["Price per image", p.perImage, UNIT_LABEL.per_image],
    ["Price per second", p.perSecond, UNIT_LABEL.per_second],
    ["Price per minute of audio", p.perMinute, UNIT_LABEL.per_minute],
    ["Price per 1M characters", p.per1MChars, UNIT_LABEL.per_1m_chars],
  ];
  return dims
    .filter(([, value]) => value !== undefined)
    .map(([name, value, unitText]) => ({
      "@type": "Offer",
      name,
      price: Number(value!.toPrecision(4)),
      priceCurrency: "USD",
      seller,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        name,
        price: Number(value!.toPrecision(4)),
        priceCurrency: "USD",
        unitText,
      },
    }));
}

export function modelGraph(v: ModelView, copy: PageCopy, dateModified: string, datePublished?: string): Json {
  const path = modelPath(v.slug);
  const features = [
    v.context ? `${v.context.toLocaleString("en-US")} token context window` : null,
    v.maxOutput ? `${v.maxOutput.toLocaleString("en-US")} max output tokens` : null,
    v.inputModalities.length ? `Input: ${v.inputModalities.join(", ")}` : null,
    v.outputModalities.length ? `Output: ${v.outputModalities.join(", ")}` : null,
    ...v.capabilities.filter((c) => c.supported).map((c) => c.label),
    `Available from ${v.providers.length} provider${v.providers.length === 1 ? "" : "s"} through LiteLLM`,
  ].filter(Boolean);
  const app: Json = {
    "@type": "SoftwareApplication",
    "@id": `${abs(path)}#model`,
    name: v.name,
    alternateName: [v.slug, ...v.alsoKnownAs],
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    url: abs(path),
    description: copy.answer,
    featureList: features,
    offers: offers(v),
  };
  if (v.lab) app.author = { "@type": "Organization", name: v.lab };
  return {
    "@context": "https://schema.org",
    "@graph": [
      ...siteNodes(),
      { ...webPage(path, copy.title, copy.description, dateModified, datePublished), about: { "@id": `${abs(path)}#model` } },
      breadcrumb([
        { name: "Models", path: "/models" },
        { name: v.name, path },
      ]),
      app,
      {
        "@type": "FAQPage",
        mainEntity: copy.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

export function listGraph(
  path: string,
  title: string,
  description: string,
  dateModified: string,
  crumbs: { name: string; path: string }[],
  items: { name: string; path: string }[],
): Json {
  return {
    "@context": "https://schema.org",
    "@graph": [
      ...siteNodes(),
      { ...webPage(path, title, description, dateModified), "@type": "CollectionPage" },
      breadcrumb(crumbs),
      {
        "@type": "ItemList",
        numberOfItems: items.length,
        itemListElement: items.slice(0, 200).map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.name,
          url: abs(item.path),
        })),
      },
    ],
  };
}

/** Safe to inline inside <script>: `</script>` can't appear in the output. */
export function jsonLdScript(data: Json): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}
