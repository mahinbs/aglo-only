export type IndicatorId =
  | "RSI"
  | "MACD"
  | "MACD_SIGNAL"
  | "MACD_HIST"
  | "EMA"
  | "SMA"
  | "BB_UPPER"
  | "BB_MIDDLE"
  | "BB_LOWER"
  | "VOLUME"
  | "PRICE"
  | "CHANGE_PCT";

export type ConditionOp =
  | "less_than"
  | "greater_than"
  | "equals"
  | "less_than_or_equal"
  | "greater_than_or_equal"
  | "crosses_above"
  | "crosses_below";

export type ConditionRhs =
  | { kind: "number"; value: number }
  | { kind: "indicator"; id: IndicatorId; period?: number };

export type AlgoCondition = {
  id: string;
  indicator: IndicatorId;
  period?: number;
  op: ConditionOp;
  rhs: ConditionRhs;
};

export type ConditionGroup = {
  id: string;
  logic: "AND" | "OR";
  conditions: AlgoCondition[];
};

export type BuilderStrategySubtype = "indicator_based" | "time_based" | "hybrid";

/** Engine + scanners use this to run PDF-aligned logic instead of visual-builder rows. */
export type AlgoGuidePresetId =
  | "ema_crossover"
  | "orb"
  | "vwap_bounce"
  | "supertrend_7_3"
  | "rsi_divergence"
  | "liquidity_sweep_bos"
  | "smc_mtf_confluence";

/**
 * Overrides for all 7 Strategy Guide + SMC presets. Live engine reads camelCase keys; omitted = PDF default.
 */
export type AlgoGuideParams = {
  // ORB
  orbOpenStartMin?: number;
  orbOpenEndMin?: number;
  orbMinRangePct?: number;
  orbMaxRangePct?: number;
  orbTpRangeMult?: number;
  // VWAP
  vwapMaxTestsPerDay?: number;
  vwapLastEntryBeforeMin?: number;
  vwapVolLookback?: number;
  vwapSlPctFromVwap?: number;
  // EMA 20/50 trend
  emaFastPeriod?: number;
  emaSlowPeriod?: number;
  emaTrendPeriod?: number;
  emaRsiPeriod?: number;
  emaRsiLongMin?: number;
  emaRsiLongMax?: number;
  emaRsiShortMin?: number;
  emaRsiShortMax?: number;
  emaVolMult?: number;
  emaVolLookback?: number;
  emaTradeStartMin?: number;
  emaTradeEndMin?: number;
  emaTpRiskReward?: number;
  // Supertrend
  stPeriod?: number;
  stMult?: number;
  stSessionStartMin?: number;
  stSessionEndMin?: number;
  stAtrFilterPct?: number;
  stTpAtrMult?: number;
  // RSI divergence
  rsiDivPeriod?: number;
  rsiDivPivotWidth?: number;
  rsiDivMinSpan?: number;
  rsiDivMaxSpan?: number;
  rsiDivConfirmBars?: number;
  rsiDivTp2Mult?: number;
  // Liquidity sweep + BOS
  lqLookback?: number;
  lqSwingWidth?: number;
  lqEqualZonePct?: number;
  lqAtrPeriod?: number;
  // SMC MTF (UTC minutes for sessions; disable gate for NSE-only testing)
  smcDisableSessionGate?: boolean;
  smcLondonStartUtcMin?: number;
  smcLondonEndUtcMin?: number;
  smcNyStartUtcMin?: number;
  smcNyEndUtcMin?: number;
  smcDemandBodyAtrRatio?: number;
  smcSwingWidth1m?: number;
};

export type EntryConditions = {
  mode: "visual" | "raw";
  groupLogic: "AND" | "OR";
  groups: ConditionGroup[];
  rawExpression: string;
  /** How the builder interprets entry rules (persisted for scans / fallbacks) */
  strategySubtype?: BuilderStrategySubtype;
  /** For time_based / hybrid — wall-clock entry (HH:MM), evaluated in scan timezone */
  clockEntryTime?: string;
  /** When set, live engine runs this preset; empty `groups` is valid (preset-only). */
  algoGuidePreset?: AlgoGuidePresetId;
  /** EMA guide row: optional scanner hint (persisted if present) */
  algoGuideBlockFirstSessionMinutes?: boolean;
  /** Per-preset tuning for ORB / VWAP / … (live strategy engine) */
  algoGuideParams?: AlgoGuideParams;
};

export type ExitConditions = {
  /** When false, strategy has no automated exits — user manages exits manually (SL/TP/time rules ignored for scans). */
  autoExitEnabled?: boolean;
  /** Omitted or ≤0 = not used in scans */
  takeProfitPct?: number;
  stopLossPct?: number;
  trailingStop?: boolean;
  trailingStopPct?: number;
  indicatorGroups?: ConditionGroup[];
  timeBasedExit?: boolean;
  exitAfterMinutes?: number;
  /** Wall-clock exit — HH:MM; omit if unused */
  clockExitTime?: string;
};

export type ScalingRule = {
  triggerPct: number;
  addQty: number;
};

export type PositionConfig = {
  orderType: "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
  sizingMode: "fixed_qty" | "risk_based" | "capital_pct";
  quantity: number;
  capitalPct: number;
  limitOffsetPct: number;
  scaling: ScalingRule[];
  /** Broker / exchange metadata from builder */
  exchange?: string;
  orderProduct?: string;
  expiryType?: string;
  strikeType?: string;
};

export type RiskConfig = {
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  capitalAllocationPct: number;
  /** Multi-exchange allowlist (e.g. LSE, NYSE, NASDAQ) for global / SMC strategies */
  allowedExchanges?: string[];
  /** Which session windows apply (London / New York UTC — matches engine gates) */
  sessionVenues?: ("london" | "new_york")[];
};

export type ChartConfig = {
  interval: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1D" | "1W";
  chartType: "candlestick" | "heikin_ashi" | "line";
};
