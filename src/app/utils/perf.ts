// Performance monitoring utilities

export type PerfPhase =
  | 'tick_total'
  | 'screenshot_capture'
  | 'encode_jpeg'
  | 'title_ocr'
  | 'rest_ocr'
  | 'find_best_bounties'
  | 'process_results_total';

export function nowMsHiRes(): number {
  return Number(process.hrtime.bigint()) / 1e6;
}

export function fmtMs(ms: number): string {
  if (!isFinite(ms)) return `${ms}`;
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(1)}ms`;
}

export class PerfWindow {
  private lastLogAt = 0;
  private counters: Record<string, number> = {};
  private totals: Record<string, number> = {};
  private maxes: Record<string, number> = {};
  private readonly windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
    this.lastLogAt = Date.now();
  }

  add(name: PerfPhase | string, ms: number): void {
    this.counters[name] = (this.counters[name] || 0) + 1;
    this.totals[name] = (this.totals[name] || 0) + ms;
    this.maxes[name] = Math.max(this.maxes[name] || 0, ms);
  }

  getAverage(name: PerfPhase | string): number | null {
    const c = this.counters[name];
    const t = this.totals[name];
    if (!c || !t) return null;
    return t / c;
  }

  getStats(): Record<string, { count: number; avg: number; max: number; total: number }> {
    const stats: Record<string, { count: number; avg: number; max: number; total: number }> = {};
    for (const k of Object.keys(this.counters)) {
      const c = this.counters[k] || 0;
      const t = this.totals[k] || 0;
      const mx = this.maxes[k] || 0;
      stats[k] = { count: c, avg: c ? t / c : 0, max: mx, total: t };
    }
    return stats;
  }

  maybeLog(prefix: string): void {
    const now = Date.now();
    if (now - this.lastLogAt < this.windowMs) return;

    const parts: string[] = [];
    const keys = Object.keys(this.counters).sort();
    for (const k of keys) {
      const c = this.counters[k] || 0;
      const t = this.totals[k] || 0;
      const mx = this.maxes[k] || 0;
      const avg = c ? t / c : 0;
      parts.push(`${k}: calls=${c}, avg=${fmtMs(avg)}, max=${fmtMs(mx)}, total=${fmtMs(t)}`);
    }

    console.log(`${prefix} perf window ${Math.round(this.windowMs / 1000)}s\n  ${parts.join('\n  ')}`);

    this.counters = {};
    this.totals = {};
    this.maxes = {};
    this.lastLogAt = now;
  }
}
