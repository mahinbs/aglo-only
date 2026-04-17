export type AlgoRobotEventLevel = "info" | "success" | "warning" | "error";

export interface AlgoRobotEventDetail {
  title: string;
  message: string;
  level: AlgoRobotEventLevel;
  timestamp: number;
}

export const ALGO_ROBOT_EVENT_NAME = "algo-robot:event";

export const ALGO_ROBOT_COPY = {
  controlLine: "You can pause, modify, or exit any strategy anytime.",
  legalSafeHint:
    "Execution runs only when your configured strategy conditions and risk filters are met.",
  readyLine: "System ready. Live trading workspace active.",
  activationSteps: [
    "Initializing trading engine",
    "Loading strategy logic",
    "Connecting market data",
    "Verifying broker session security",
    "Syncing risk parameters",
    "Activating execution engine",
  ],
  strategyStates: {
    scanning: "Scanning market conditions",
    forming: "Conditions forming",
    awaiting: "Awaiting confirmation",
    matched: "Strategy condition matched",
    validating: "Validating risk filters",
    ready: "Ready for execution",
    executed: "Position active - monitoring risk",
    idle: "Waiting for next live evaluation",
  },
  metricMethodology: {
    winRate: "Winning closed trades / total closed trades.",
    payoff: "Average winning P&L divided by average losing P&L.",
    profitFactor: "Gross profits divided by gross losses from closed trades.",
    fillEfficiency: "Fully filled orders / all submitted orders.",
    rejectionRate: "Rejected orders / all submitted orders.",
    slippageProxy:
      "Absolute difference between expected and executed price where both are available.",
  },
} as const;

export function emitAlgoRobotEvent(
  title: string,
  message: string,
  level: AlgoRobotEventLevel = "info",
) {
  if (typeof window === "undefined") return;
  const detail: AlgoRobotEventDetail = {
    title,
    message,
    level,
    timestamp: Date.now(),
  };
  window.dispatchEvent(new CustomEvent(ALGO_ROBOT_EVENT_NAME, { detail }));
}
