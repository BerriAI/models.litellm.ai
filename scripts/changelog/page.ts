import type { AppPage } from "../seo/app-pages";
import { escapeHtml as esc } from "../seo/format";
import type { ChangelogData } from "./build";
import { changelogItems } from "../../src/changelogPresentation";
/** The same values without JS, so the dedicated route also works for crawlers. */
export function changelogPage(data: ChangelogData): AppPage {
  const items = changelogItems(data.updates, data.providerNames)
    .filter((i) => i.kind !== "metadata")
    .slice(0, 40);
  return {
    breadcrumbs: [
      { name: "Home", path: "/" },
      { name: "Changelog", path: "/changelog" },
    ],
    lastmod: data.through.slice(0, 10),
    body: `<h1>Changelog</h1><p>Model pricing, new models, and provider updates. <a href="/changelog.xml">RSS feed</a></p>${items
      .map(
        (item) =>
          `<article><time datetime="${item.date}">${item.date}</time><h2>${esc(item.headline)}</h2>${item.lines
            .slice(0, 3)
            .map((line) => `<p>${esc(line)}</p>`)
            .join("")}<a href="${esc(item.source)}">Source</a></article>`,
      )
      .join("")}`,
  };
}
