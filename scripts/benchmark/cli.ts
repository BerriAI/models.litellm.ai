#!/usr/bin/env node
import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomInt } from "node:crypto";
import { Gateway, GatewayError } from "./gateway";
import { traffic, sampleSessions, type Model, type Obj } from "./data";
import { run } from "./run";
import { ProgressDisplay } from "./progress";
import { saveReport } from "./report";
import { fixtureRows, FixtureGateway } from "./fixture";
import { estimateCost } from "./planning";
const args = process.argv.slice(2);
function answer<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Cancelled. No evaluation started.");
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}
const positive = (value: string | undefined) =>
  !value || !Number.isFinite(Number(value)) || Number(value) <= 0
    ? "Enter a positive number."
    : undefined;
const integer = (value: string | undefined) =>
  positive(value) ||
  (!Number.isInteger(Number(value)) ? "Enter a whole number." : undefined);
const safeLabel = (s: string) =>
  s
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/https?:\/\/\S+/g, "[address hidden]")
    .slice(0, 120);
function open(path: string) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer"
        : "xdg-open";
  const child = spawn(command, [path], { stdio: "ignore", detached: true });
  child.on("error", () =>
    p.log.info("Open the saved HTML file with your browser."),
  );
  child.unref();
}
async function importLogs(path: string, currentDays: number): Promise<Obj[]> {
  let data: any;
  try {
    data = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(
      "Could not read that JSON export. Expected an array of LiteLLM spend-log rows.",
    );
  }
  const rows = Array.isArray(data) ? data : data.data;
  if (
    !Array.isArray(rows) ||
    rows.some(
      (r) => !r || typeof r !== "object" || typeof r.request_id !== "string",
    )
  )
    throw new Error(
      "Expected spend-log rows with request_id and optional proxy_server_request.body / response.",
    );
  const end = Date.now(),
    start = end - currentDays * 86400000;
  return rows.filter((r) => {
    const time = Date.parse(r.startTime);
    return Number.isFinite(time) && time >= start && time <= end;
  });
}
async function main() {
  if (args.includes("--help")) {
    console.log(
      "LiteLLM local benchmark\n\n  npm run benchmark           Interactive gateway evaluation\n  npm run benchmark -- --demo  Synthetic offline demo; no credentials or API calls\n\nRequires Node.js 22+. Reads LITELLM_BASE_URL / LITELLM_API_BASE and\nLITELLM_API_KEY, falling back to OPENAI_BASE_URL / OPENAI_API_KEY.\nAll detected values are editable. Reports stay local.",
    );
    return;
  }
  const seedIndex = args.indexOf("--seed");
  const seedArgument = seedIndex >= 0 ? Number(args[seedIndex + 1]) : undefined;
  if (
    seedIndex >= 0 &&
    (!Number.isInteger(seedArgument) ||
      seedArgument! < 1 ||
      seedArgument! > 2147483646)
  )
    throw new Error("--seed requires an integer from 1 to 2147483646.");
  if (
    args.some(
      (a, i) =>
        a !== "--demo" &&
        !(seedIndex >= 0 && (i === seedIndex || i === seedIndex + 1)),
    )
  )
    throw new Error("Unknown option. Use --help.");
  const seed = seedArgument ?? randomInt(1, 2147483647);
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw new Error("The benchmark runner requires Node.js 22 or later.");
  const demo = args.includes("--demo");
  if (!demo && !process.stdin.isTTY)
    throw new Error(
      "Run in an interactive terminal, or use --demo for a synthetic offline report.",
    );
  const display = new ProgressDisplay();
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  let active = false;
  try {
    p.intro("LiteLLM · Find the right model for your traffic");
    let gateway: Gateway,
      rows: Obj[],
      models: Model[],
      candidates: Model[],
      judge: Model;
    let days = 7,
      sessions = 40,
      budget = 5,
      inventoryComplete = true,
      imported = demo;
    if (demo) {
      gateway = new FixtureGateway();
      rows = fixtureRows;
      models = [
        { id: "example-current", input: 0.00001, output: 0.00002 },
        { id: "example-candidate", input: 0.000001, output: 0.000002 },
      ];
      candidates = [models[1]];
      judge = models[0];
      p.log.info(
        "Synthetic demo. All responses, scores, and costs are simulated.",
      );
    } else {
      const base = answer(
        await p.text({
          message: "LiteLLM base URL",
          initialValue:
            process.env.LITELLM_BASE_URL ||
            process.env.LITELLM_API_BASE ||
            process.env.OPENAI_BASE_URL ||
            "",
          validate: (v) => {
            try {
              new Gateway(v || "", "");
            } catch {
              return "Enter an HTTPS gateway URL (or HTTP loopback for local development).";
            }
          },
        }),
      );
      let key = process.env.LITELLM_API_KEY || process.env.OPENAI_API_KEY || "";
      if (key) {
        const use = answer(
          await p.select({
            message: "API key",
            options: [
              {
                value: true,
                label: `Use detected key · ********${key.length > 6 ? key.slice(-3) : ""}`,
              },
              { value: false, label: "Enter another key" },
            ],
          }),
        );
        if (!use) key = "";
      }
      if (!key)
        key = answer(
          await p.password({
            message: "LiteLLM API key",
            validate: (v) => (v?.trim() ? undefined : "Enter a key."),
          }),
        );
      gateway = new Gateway(base, key, controller.signal);
      display.update({
        stage: "Discovering gateway models",
        done: 0,
        total: null,
        spend: 0,
      });
      models = await gateway.models();
      display.stop(`Found ${models.length} accessible models`);
      if (!models.length)
        throw new Error(
          "This key has no accessible models. Check its model permissions.",
        );
      days = Number(
        answer(
          await p.text({
            message: "Traffic from the last how many days?",
            initialValue: "7",
            validate: integer,
          }),
        ),
      );
      const source = answer(
        await p.select({
          message: "Read your traffic",
          options: [
            { value: "gateway", label: "Gateway logs", hint: "recommended" },
            { value: "file", label: "Local JSON export" },
          ],
        }),
      );
      if (source === "file") {
        const path = answer(
          await p.text({
            message: "Path to your spend-log JSON export",
            validate: (v) => (v ? undefined : "Enter a path."),
          }),
        );
        rows = await importLogs(path, days);
        imported = true;
      } else {
        try {
          const result = await gateway.logs(days, (count) =>
            display.update({
              stage: "Understanding your traffic",
              done: count,
              total: null,
              spend: 0,
            }),
          );
          rows = result.rows;
          inventoryComplete = result.complete;
          display.stop(`Scanned ${rows.length} requests`);
        } catch (error) {
          display.stop("Logs unavailable");
          p.log.warn(
            error instanceof GatewayError
              ? error.message
              : "The gateway log format is unsupported.",
          );
          const path = answer(
            await p.text({
              message: "Use a local spend-log JSON export (Ctrl+C to exit)",
              validate: (v) => (v ? undefined : "Enter a path."),
            }),
          );
          rows = await importLogs(path, days);
          imported = true;
        }
      }
      const inventory = traffic(rows);
      p.log.info(
        `${inventory.length} requests in ${new Set(inventory.map((r) => r.session)).size} session groups. Only rows within the selected date window are included.`,
      );
      sessions = Number(
        answer(
          await p.text({
            message: "How many sessions should we sample?",
            initialValue: "40",
            validate: integer,
          }),
        ),
      );
      const recommended = [...models]
        .filter((m) => m.input !== undefined && m.output !== undefined)
        .sort((a, b) => a.input! + a.output! - (b.input! + b.output!))
        .slice(0, 3)
        .map((m) => m.id);
      const ids = answer(
        await p.multiselect({
          message: "Models to compare · Space to select, Enter to continue",
          options: models.map((m) => ({
            value: m.id,
            label: safeLabel(m.id),
            hint: recommended.includes(m.id) ? "suggested by price" : undefined,
          })),
          initialValues: recommended,
          required: true,
        }),
      );
      candidates = ids.map((id) => models.find((m) => m.id === id)!);
      const counts = new Map<string, number>();
      for (const r of inventory)
        counts.set(r.model, (counts.get(r.model) || 0) + 1);
      const defaultJudge = [...models].sort(
        (a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0),
      )[0];
      const judgeId = answer(
        await p.select({
          message: "Model used to infer checks and judge responses",
          options: models.map((m) => ({ value: m.id, label: safeLabel(m.id) })),
          initialValue: defaultJudge.id,
        }),
      );
      judge = models.find((m) => m.id === judgeId)!;
      budget = Number(
        answer(
          await p.text({
            message: "Evaluation spending target (USD)",
            initialValue: "5",
            validate: positive,
          }),
        ),
      );
      const sampled = sampleSessions(inventory, sessions, seed).rows;
      const planning = estimateCost(sampled, candidates, judge);
      p.log.info(
        planning === null
          ? "Cost estimate unavailable: gateway pricing metadata is missing."
          : `Planning estimate: ~$${planning.toFixed(2)}, using logged token volumes. Actual output lengths and judging costs can differ.`,
      );
      p.note(
        candidates
          .map((m, i) => `Candidate ${i + 1}: ${safeLabel(m.id)}`)
          .join("\n") +
          "\nJudge: " +
          safeLabel(judge.id) +
          "\n\nSample up to " +
          sessions +
          " sessions. All selected models and the judge receive sampled content through your gateway.\nOne request runs at a time. The $" +
          budget.toFixed(2) +
          " target includes judging; one in-flight call can exceed it. Use a gateway key budget for a hard limit.\nCost estimates are available only when the gateway exposes usage and pricing. Unknown billing stops further calls.",
        "Review your run",
      );
      if (
        !answer(
          await p.confirm({
            message: "Start the evaluation?",
            initialValue: true,
          }),
        )
      )
        return;
    }
    process.on("SIGINT", interrupt);
    active = true;
    const report = await run(gateway, {
      rows,
      baselineLabels: Object.fromEntries(
        models.filter((m) => m.label).map((m) => [m.id, m.label!]),
      ),
      days,
      sessions,
      seed,
      candidates,
      judge,
      budget,
      inventoryComplete,
      imported,
      signal: controller.signal,
      onProgress: (s) => display.update(s),
    });
    if (demo) report.synthetic = true;
    if (demo)
      report.notices.unshift(
        "SYNTHETIC DEMO: responses, judge scores, latency, and costs are simulated. No evaluation of real models has run.",
      );
    display.update({
      stage: "Building your report",
      done: 0,
      total: null,
      spend: report.evaluationSpend,
    });
    const filename = resolve(`litellm-benchmark-${Date.now()}.html`);
    await saveReport(report, filename);
    display.stop("Report saved");
    p.outro(filename);
    if (
      !demo &&
      !controller.signal.aborted &&
      answer(
        await p.confirm({ message: "Open your report?", initialValue: true }),
      )
    )
      open(filename);
  } finally {
    display.stop("Stopped");
    if (active) process.off("SIGINT", interrupt);
  }
}
main().catch((error) => {
  p.log.error(
    error instanceof GatewayError
      ? error.message
      : error instanceof Error && !/https?:\/\/|Bearer|sk-/.test(error.message)
        ? error.message
        : "Run failed. Check the gateway connection and try again. No raw diagnostics were saved.",
  );
  process.exitCode = 1;
});
