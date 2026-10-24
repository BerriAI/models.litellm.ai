import * as p from "@clack/prompts";
import type { Progress } from "./run";
export function eta(
  elapsedMs: number,
  done: number,
  total: number | null,
): string {
  if (total === null || done < 2 || elapsedMs < 1000) return "estimating ETA";
  const seconds = Math.max(
    0,
    Math.ceil(((elapsedMs / done) * (total - done)) / 1000),
  );
  return seconds < 60
    ? `~${seconds}s remaining`
    : `~${Math.ceil(seconds / 60)}m remaining`;
}
export class ProgressDisplay {
  private spinner = p.spinner();
  private stage = "";
  private start = Date.now();
  private state: Progress = {
    stage: "Starting",
    done: 0,
    total: null,
    spend: 0,
  };
  private timer: ReturnType<typeof setInterval> | undefined;
  update(state: Progress) {
    if (state.stage !== this.stage) {
      if (this.stage) this.spinner.stop(this.stage);
      this.stage = state.stage;
      this.start = Date.now();
      this.spinner = p.spinner();
      this.spinner.start(state.stage);
    }
    this.state = state;
    if (!this.timer) this.timer = setInterval(() => this.render(), 1000);
    this.render();
  }
  private render() {
    const s = this.state,
      elapsed = Date.now() - this.start;
    const count = s.total === null ? `${s.done} found` : `${s.done}/${s.total}`;
    const bar =
      s.total && (process.stdout.columns ?? 80) >= 100
        ? " " + "━".repeat(Math.round((s.done / s.total) * 16)).padEnd(16, "─")
        : "";
    this.spinner.message(
      `${s.stage}${bar}  ${count} · ${Math.floor(elapsed / 1000)}s elapsed · ${eta(elapsed, s.done, s.total)} · $${s.spend.toFixed(3)}`,
    );
  }
  stop(message: string) {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.stage) this.spinner.stop(message);
    this.stage = "";
  }
}
