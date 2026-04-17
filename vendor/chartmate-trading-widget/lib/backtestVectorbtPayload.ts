/**
 * Shared helpers for VectorBT backtests (Algo → Backtesting tab and portfolio Actions panel).
 * Keeps custom-strategy snapshot + condition detection aligned with BacktestingSection.
 */
import { STRATEGIES } from "@/components/trading/StrategySelectionDialog";

/** Map time-based exit (minutes) to a coarse day count for daily VectorBT runs. */
export function deriveMaxHoldDaysFromExit(xc: unknown): number | null {
  if (!xc || typeof xc !== "object") return null;
  const e = xc as Record<string, unknown>;
  if (e.timeBasedExit === true && typeof e.exitAfterMinutes === "number" && e.exitAfterMinutes > 0) {
    return Math.max(1, Math.min(365, Math.ceil(Number(e.exitAfterMinutes) / (60 * 24))));
  }
  return null;
}

/**
 * Intraday strategies should not carry overnight in backtests.
 * We cap them to 1 day; non-intraday keeps existing exit-derived behavior.
 */
export function deriveMaxHoldDaysForStrategy(cs: Pick<FullCustomStrategy, "is_intraday" | "exit_conditions">): number | null {
  if (cs.is_intraday === true) return 1;
  return deriveMaxHoldDaysFromExit(cs.exit_conditions);
}

/** True when custom entry rules should be sent to VectorBT (matches strategy-entry-signals idea). */
export function entryConditionsConfigured(ec: unknown): boolean {
  if (!ec || typeof ec !== "object") return false;
  const cfg = ec as Record<string, unknown>;
  const st = String(cfg.strategySubtype ?? "").toLowerCase();
  if (st === "time_based" || st === "hybrid") return true;
  const groups = Array.isArray(cfg.groups) ? cfg.groups : [];
  const hasVisual = groups.some(
    (g: { conditions?: unknown[] }) => Array.isArray(g?.conditions) && g.conditions.length > 0,
  );
  const hasRaw = typeof cfg.rawExpression === "string" && cfg.rawExpression.trim().length > 0;
  return hasVisual || hasRaw;
}

const PRESET_ENGINE_STRATEGY_IDS = new Set(STRATEGIES.map(s => s.value));

export function resolveEngineStrategyIdForCustom(paperStrategyType: string | null | undefined): string {
  const v = String(paperStrategyType ?? "").trim().toLowerCase();
  if (v && PRESET_ENGINE_STRATEGY_IDS.has(v)) return v;
  return "trend_following";
}

export type FullCustomStrategy = {
  id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  trading_mode?: string;
  is_intraday?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  squareoff_time?: string | null;
  risk_per_trade_pct?: number | null;
  stop_loss_pct?: number | null;
  take_profit_pct?: number | null;
  entry_conditions?: unknown;
  exit_conditions?: unknown;
  market_type?: string | null;
  paper_strategy_type?: string | null;
  symbols?: unknown[];
  execution_days?: number[] | null;
  position_config?: Record<string, unknown> | null;
  risk_config?: Record<string, unknown> | null;
  chart_config?: Record<string, unknown> | null;
};

/** Saved strategy row (no secrets) — base for VectorBT payload. */
export function buildCustomStrategySnapshot(cs: FullCustomStrategy): Record<string, unknown> {
  return {
    id: cs.id,
    name: cs.name,
    description: cs.description ?? null,
    trading_mode: cs.trading_mode ?? null,
    is_intraday: cs.is_intraday ?? null,
    start_time: cs.start_time ?? null,
    end_time: cs.end_time ?? null,
    squareoff_time: cs.squareoff_time ?? null,
    risk_per_trade_pct: cs.risk_per_trade_pct ?? null,
    stop_loss_pct: cs.stop_loss_pct ?? null,
    take_profit_pct: cs.take_profit_pct ?? null,
    market_type: cs.market_type ?? null,
    paper_strategy_type: cs.paper_strategy_type ?? null,
    symbols: cs.symbols ?? null,
    execution_days: cs.execution_days ?? null,
    entry_conditions: cs.entry_conditions ?? null,
    exit_conditions: cs.exit_conditions ?? null,
    position_config: cs.position_config ?? null,
    risk_config: cs.risk_config ?? null,
    chart_config: cs.chart_config ?? null,
    is_active: cs.is_active ?? null,
  };
}

/** Snapshot with this run’s symbol / SL / TP (form overrides what was saved on the strategy). */
export function mergeSnapshotWithBacktestRun(
  cs: FullCustomStrategy,
  runSymbol: string,
  runExchange: string,
  runSlPct: number,
  runTpPct: number,
): Record<string, unknown> {
  const base = buildCustomStrategySnapshot(cs);
  base.stop_loss_pct = runSlPct;
  base.take_profit_pct = runTpPct;
  base.backtest_symbol = runSymbol;
  base.backtest_exchange = runExchange;
  return base;
}
