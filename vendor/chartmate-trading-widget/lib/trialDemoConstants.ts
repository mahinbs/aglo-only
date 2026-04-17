export const TRIAL_ACTIVATION_STEPS: { pct: number; label: string }[] = [
  { pct: 10, label: "Initializing trading engine..." },
  { pct: 30, label: "Loading your custom strategy..." },
  { pct: 50, label: "Validating risk parameters..." },
  { pct: 70, label: "Connecting to broker..." },
  { pct: 90, label: "Deploying execution model..." },
  { pct: 100, label: "System Ready." },
];

export const TRIAL_DEMO_PHASES = [
  "activation",
  "system_boot",
  "strategy_analysis",
  "market_scan",
  "execution_trigger",
  "trade_live",
  "proof_logs",
  "control_reassurance",
] as const;

export type TrialDemoPhase = (typeof TRIAL_DEMO_PHASES)[number];

export const TRIAL_PHASE_TIMINGS_MS: Record<TrialDemoPhase, number> = {
  activation: 0,
  system_boot: 2500,
  strategy_analysis: 3000,
  market_scan: 4000,
  execution_trigger: 2200,
  trade_live: 3000,
  proof_logs: 4000,
  control_reassurance: 0,
};

export const TRIAL_NEXT_PHASE: Partial<Record<TrialDemoPhase, TrialDemoPhase>> = {
  activation: "system_boot",
  system_boot: "strategy_analysis",
  strategy_analysis: "market_scan",
  market_scan: "execution_trigger",
  execution_trigger: "trade_live",
  trade_live: "proof_logs",
  proof_logs: "control_reassurance",
};

/** Stage 1–4: scanning → setup → validation → ready */
export const TRIAL_INTEL_LINES: Record<number, string[]> = {
  1: ["Scanning market conditions...", "Monitoring liquidity zones..."],
  2: ["Structure forming...", "Waiting for confirmation..."],
  3: ["Conditions matched", "Running risk validation...", "AI confidence check..."],
  4: ["Valid setup detected", "Ready for execution"],
};

/** Body lines under the “Strategy Triggered” title */
export const TRIAL_EXECUTION_STEPS = [
  "Condition match detected",
  "Sending order to broker...",
  "Order confirmed",
  "Execution event is now live",
] as const;

export const TRIAL_RECENT_EXECUTIONS: {
  id: string;
  strategy: string;
  entry: string;
  exit: string;
  result: string;
  positive: boolean;
}[] = [
  {
    id: "#1821",
    strategy: "Liquidity Sweep + BOS",
    entry: "10:32 AM",
    exit: "11:10 AM",
    result: "+2.8%",
    positive: true,
  },
  {
    id: "#1819",
    strategy: "Momentum Alpha",
    entry: "09:14 AM",
    exit: "09:52 AM",
    result: "+3.1%",
    positive: true,
  },
  {
    id: "#1817",
    strategy: "Mean Reversion X",
    entry: "14:02 PM",
    exit: "15:18 PM",
    result: "-1.2%",
    positive: false,
  },
];
