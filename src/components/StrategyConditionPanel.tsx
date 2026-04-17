/**
 * Placeholder for live per-condition status (strategy_condition_events / engine feed).
 * Wire to backend events when the stream is available; for now shows a compact status line.
 */
export function StrategyConditionPanel(props: {
  strategyName: string;
  brokerLive: boolean;
  streamStale?: boolean;
}) {
  const { strategyName, brokerLive, streamStale } = props;
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground/90">{strategyName}</span>
      {" · "}
      {brokerLive ? (
        <span className={streamStale ? "text-amber-400" : "text-emerald-400"}>
          {streamStale ? "Live data stale — reconnecting…" : "Live evaluation (engine + broker)"}
        </span>
      ) : (
        <span className="text-slate-500">Connect broker for live condition ticks</span>
      )}
    </div>
  );
}
