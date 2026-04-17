/** Merge deploy-time session/clock/auto-exit into a copy of the strategy row (browser; mirrors edge `_shared/pendingConditionalExecution`). */

type DeployOverrides = {
  start_time?: string;
  end_time?: string;
  squareoff_time?: string;
  clock_entry_time?: string;
  clock_exit_time?: string;
  use_auto_exit?: boolean;
};

function cloneJson<T>(v: T): T {
  try {
    return JSON.parse(JSON.stringify(v)) as T;
  } catch {
    return v;
  }
}

export function applyDeployOverridesToStrategyRow(
  strategy: Record<string, unknown>,
  overrides: unknown,
): Record<string, unknown> {
  const o = overrides && typeof overrides === "object" ? overrides as DeployOverrides : {};
  const out = { ...strategy };

  if (o.start_time !== undefined && String(o.start_time).trim()) {
    out.start_time = String(o.start_time).trim();
  }
  if (o.end_time !== undefined && String(o.end_time).trim()) {
    out.end_time = String(o.end_time).trim();
  }
  if (o.squareoff_time !== undefined && String(o.squareoff_time).trim()) {
    out.squareoff_time = String(o.squareoff_time).trim();
  }

  const entryRaw = strategy.entry_conditions;
  if (o.clock_entry_time !== undefined && String(o.clock_entry_time).trim()) {
    const ent = entryRaw && typeof entryRaw === "object"
      ? cloneJson(entryRaw) as Record<string, unknown>
      : {};
    ent.clockEntryTime = String(o.clock_entry_time).trim();
    out.entry_conditions = ent;
  }

  const exitRaw = strategy.exit_conditions;
  const useAuto = o.use_auto_exit;

  if (useAuto === false) {
    out.exit_conditions = { autoExitEnabled: false };
    out.stop_loss_pct = null;
    out.take_profit_pct = null;
  } else {
    const base = exitRaw && typeof exitRaw === "object"
      ? cloneJson(exitRaw) as Record<string, unknown>
      : {};
    if (useAuto === true) {
      base.autoExitEnabled = true;
    }
    if (o.clock_exit_time !== undefined && String(o.clock_exit_time).trim()) {
      base.clockExitTime = String(o.clock_exit_time).trim();
    }
    if (useAuto === true || o.clock_exit_time !== undefined) {
      out.exit_conditions = Object.keys(base).length ? base : exitRaw;
    }
  }

  return out;
}
