import "./trial-demo.css";

const PARITY_ROWS = [
  {
    area: "Dashboard shell",
    original: "Market state, broker session, legal control copy",
    trial: "Simulated market/broker strip + control/legal copy",
  },
  {
    area: "Algo workspace",
    original: "Portfolio + strategy controls + execution events",
    trial: "Robot command center + strategy intelligence + live feed",
  },
  {
    area: "Options workspace",
    original: "Options strategies + paper/live positions + chain viewer",
    trial: "Options demo pane with strategy/position simulation",
  },
  {
    area: "Execution narrative",
    original: "System events + fills + operational controls",
    trial: "Phase machine + climax + proof logs + reassurance",
  },
];

export function ParityMatrixPanel() {
  return (
    <div className="card trial-parity-card">
      <div className="card-header">
        <div className="card-title">
          <span className="card-title-icon">M</span>
          Feature parity map
        </div>
      </div>
      <div className="trial-parity-table">
        {PARITY_ROWS.map((row) => (
          <div className="trial-parity-row" key={row.area}>
            <div className="trial-parity-col area">{row.area}</div>
            <div className="trial-parity-col">{row.original}</div>
            <div className="trial-parity-col">{row.trial}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
