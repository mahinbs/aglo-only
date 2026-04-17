import "./trial-demo.css";

const STRATEGIES = [
  {
    id: "opt-1",
    name: "NIFTY ORB Breakout",
    style: "ORB Buying",
    strike: "ATM+1",
    expiry: "Weekly",
    sl: "30%",
    tp: "50%",
    status: "Paper",
  },
  {
    id: "opt-2",
    name: "BANKNIFTY Strangle",
    style: "Short Vol",
    strike: "±300",
    expiry: "Weekly",
    sl: "2x premium",
    tp: "45%",
    status: "Live",
  },
];

const OPEN_POSITIONS = [
  { symbol: "NIFTY 23650 CE", entry: 142.2, current: 156.6, pnlPct: 10.1, dte: "2d" },
  { symbol: "BANKNIFTY 49800 PE", entry: 228.4, current: 211.5, pnlPct: -7.4, dte: "Today" },
];

export function OptionsDemoPane() {
  return (
    <div className="trial-options-grid">
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-icon">O</span>
            Options Strategies
          </div>
          <span className="card-badge badge-blue">Demo</span>
        </div>
        <div className="trial-options-list">
          {STRATEGIES.map((s) => (
            <div key={s.id} className="trial-options-item">
              <div className="trial-options-head">
                <strong>{s.name}</strong>
                <span className={`trial-options-status ${s.status === "Live" ? "is-live" : "is-paper"}`}>
                  {s.status}
                </span>
              </div>
              <div className="trial-options-meta">
                {s.style} · Strike {s.strike} · {s.expiry}
              </div>
              <div className="trial-options-metrics">
                <span>SL {s.sl}</span>
                <span>TP {s.tp}</span>
                <button type="button" className="trial-options-mini-btn">
                  View Option Chain
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span className="card-title-icon">P</span>
            Open Options Positions
          </div>
          <span className="card-badge badge-green">Live-like</span>
        </div>
        <div className="trial-options-list">
          {OPEN_POSITIONS.map((p) => (
            <div key={p.symbol} className="trial-options-item">
              <div className="trial-options-head">
                <strong>{p.symbol}</strong>
                <span className={p.pnlPct >= 0 ? "trial-pnl-pos" : "trial-pnl-neg"}>
                  {p.pnlPct >= 0 ? "+" : ""}
                  {p.pnlPct.toFixed(1)}%
                </span>
              </div>
              <div className="trial-options-meta">
                Entry {p.entry.toFixed(2)} · Current {p.current.toFixed(2)}
              </div>
              <div className="trial-options-metrics">
                <span>DTE {p.dte}</span>
                <button type="button" className="trial-options-mini-btn">
                  Exit Position
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
