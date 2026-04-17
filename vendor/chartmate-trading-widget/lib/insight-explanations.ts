/** Short “why this label” copy for Insights cards (post-analysis). */

import { formatKeyDriver, formatTechnicalFactor } from "@/lib/display-utils";

function norm(raw: string) {
  return raw.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

export function explainDriverKey(raw: string): string {
  const k = norm(raw);
  const map: Record<string, string> = {
    mean_reversion:
      "Price has moved away from its recent average; the engine weighs a partial snap-back unless trend strength overrides.",
    volume_confirmation:
      "Volume either backs the move (stronger conviction) or leaves it fragile (low participation).",
    momentum:
      "Momentum here is how fast price has been moving over recent closes in this run. Strong momentum suggests the current push may continue; weak momentum suggests the move could fade until new structure prints.",
    rsi_signal:
      "Relative strength index context (overbought/oversold/neutral) feeding the probability mix.",
    macd_signal:
      "Trend/momentum crossover structure from MACD—used as one vote, not a standalone trigger.",
    trend_following:
      "Signals aligned with the prevailing trend direction on your chart timeframe.",
    bollinger_squeeze:
      "Volatility compression that often precedes a larger move; direction still needs confirmation.",
    quantum_ensemble:
      "Blended statistical models when the primary AI path is unavailable or as a cross-check.",
    sentiment:
      "Headline and text sentiment from news feeds—can diverge from pure price action.",
  };
  return map[k] || "Feature from the model stack that influenced scores; it is one input among many, not a guarantee.";
}

export function explainRiskKey(raw: string): string {
  const k = norm(raw);
  const map: Record<string, string> = {
    high_volatility: "ATR/volatility regime suggests wider swings—position size and stops should reflect that.",
    extreme_deviation: "Price is far from a key mean; mean-reversion and trend trades both carry whip risk.",
    low_volume_confirmation: "The move lacks strong volume backing; breakouts are easier to fake.",
    weak_trend: "Trend strength is low—directional trades have less edge until structure improves.",
    extreme_volatility_regime: "Volatility is in a stress bucket; expect gaps and fast reversals.",
    volatility_breakout_imminent: "A volatility squeeze may resolve soon—wait for direction confirmation.",
  };
  return map[k] || "Risk flag from the pipeline; review how it interacts with your timeframe and leverage.";
}

/**
 * Plain-language meaning for rule-based pattern codes (same keys as formatTechnicalFactor).
 * Copy assumes signals were computed on the candle window available when this analysis ran.
 */
export function explainTechnicalFactorKey(raw: string): string {
  const k = norm(raw);
  const map: Record<string, string> = {
    oversold_rsi:
      "RSI dipped into a traditionally oversold zone on the bars fed into this run. That describes recent momentum, not a timed entry signal by itself.",
    overbought_rsi:
      "RSI pushed into a traditionally overbought zone on those same bars. It flags stretched upside, not a guaranteed reversal time.",
    rsi_bullish:
      "RSI posture on this window leaned bullish (momentum recovering or holding higher). Confirm on your chart timeframe.",
    rsi_bearish:
      "RSI posture on this window leaned bearish. Again, it is one oscillator vote on closed candles, not live order flow.",
    macd_bearish:
      "Bearish MACD read: on the candles fed into this analysis, the MACD line crossed under or stayed below the signal line, which the model treats as cooling or downward short-term momentum (not a timed short signal by itself).",
    macd_bullish:
      "Bullish MACD read: on those same candles, the MACD line crossed over or stayed above the signal line, which the model treats as building or holding upward short-term momentum (not a timed long signal by itself).",
    macd_momentum_bearish:
      "MACD histogram or slope turned negative in this run’s lookback: selling pressure in the indicator strengthened on the closes the server saw, before any bars that printed after your snapshot.",
    macd_momentum_bullish:
      "MACD histogram or slope turned positive in this lookback: buying pressure in the indicator strengthened on those closes, still only as of the analysis snapshot.",
    bb_lower_band:
      "Price interacted with the lower Bollinger band on recent closes: often volatility or mean-reversion context; direction still needs structure.",
    bb_upper_band:
      "Price interacted with the upper band: often extension or continuation risk; not automatic sell timing.",
    bb_squeeze:
      "Bollinger bands narrowed: volatility compression that often precedes a larger move; the model still has to pick direction.",
    volume_trend_bearish:
      "Volume trend alongside price was weak or fading on the sampled bars, so downside moves had less participation backing.",
    volume_trend_bullish:
      "Volume was rising as price moved up on the sampled bars: more shares/contracts traded into the up move, which the model weights as healthier participation than a thin rally.",
    high_volume:
      "Volume on the latest segment was unusually high versus its own recent baseline in this pipeline.",
    low_volume:
      "Volume was subdued versus recent norms: easier for price to whip because fewer shares traded into the move.",
    ma_golden_cross:
      "A faster moving average crossed above a slower one on this data: a classic trend-follow cue, still lagging by design.",
    ma_death_cross:
      "A faster average crossed below a slower one: trend weakness on those parameters, not a timed exit by itself.",
    above_ma:
      "Last assessed close was above the moving average the engine uses: structure supportive for long bias until the next bars print.",
    below_ma:
      "Last assessed close was below that moving average: structure supportive for cautious or short-leaning reads until it reclaims.",
    strong_momentum_bearish:
      "Downward price velocity ranked strong versus this run’s lookback: trend strength, not a calendar timestamp.",
    strong_momentum_bullish:
      "Upward price velocity ranked strong versus this run’s lookback.",
    mean_reversion_bearish:
      "Model read stretched conditions that often invite snap-back lower or slower drift; still needs your risk rules.",
    mean_reversion_bullish:
      "Model read stretched conditions that often invite bounce or grind higher; confirm with trend and volume.",
    near_support:
      "Price is near a modeled support zone from structure math in this run. Touch probability is separate from immediate direction.",
    near_resistance:
      "Price is near a modeled resistance zone. Red resistance markers describe level type, not that the market must fall right now.",
    breakout_resistance:
      "Price cleared a modeled resistance level on the closes the engine saw: continuation context until it fails back under.",
    breakdown_support:
      "Price lost a modeled support level on those closes: failure context until it reclaims.",
  };
  return (
    map[k] ||
    "Rule-based tag from the candle series at analysis time. Open the chart on the same symbol and timeframe to see where it fired."
  );
}

export function explainPatternKey(raw: string): string {
  const k = norm(raw);
  const map: Record<string, string> = {
    macd_bearish: "MACD line below signal: short-term momentum leaning down on this window.",
    macd_bullish: "MACD line above signal: short-term momentum leaning up on this window.",
    macd_momentum_bearish:
      "MACD histogram or slope turned negative on the closes in this run: downside momentum was building in that lookback.",
    macd_momentum_bullish:
      "MACD histogram or slope turned positive on the closes in this run: upside momentum was building in that lookback.",
    strong_momentum_bullish:
      "Price velocity versus recent bars ranked strong to the upside on the data fed into this analysis.",
    strong_momentum_bearish:
      "Price velocity versus recent bars ranked strong to the downside on the data fed into this analysis.",
    bb_breakout_lower: "Close or probe near/below lower Bollinger Band—often mean-reversion or breakdown context.",
    bb_breakout_upper: "Close or probe near/above upper band—often continuation or exhaustion context.",
    oversold_rsi: "RSI in a low zone—bounce potential, not automatic buy without structure.",
    overbought_rsi: "RSI in a high zone—pullback potential, not automatic sell without structure.",
    mean_reversion_down: "Downside mean-reversion bias—price may be stretched below short-term fair value; confirm with trend.",
    mean_reversion_bullish: "Bullish mean-reversion cue—often after a dip into support or oversold momentum.",
    mean_reversion_bearish: "Bearish mean-reversion cue—often after a spike into resistance.",
    at_lower_bb: "Price interacting with the lower Bollinger band—watch for bounce vs breakdown.",
    volume_trend_bullish:
      "Volume trend moved up with price on the bars in this run: participation supported the directional lean.",
    volume_trend_bearish:
      "Volume trend faded or worked against the move on those bars: easier for reversals until participation returns.",
  };
  return map[k] || "Pattern label from rule-based detection on your candle series; confirm on the chart.";
}

/** Deduped glossary lines for “At a glance” and similar narrative blocks. */
export function buildReasoningGlossaryItems(
  technicalFactors: string[],
  keyDrivers: string[],
  riskFlags: string[] = [],
  maxItems = 12,
): { title: string; body: string }[] {
  const seen = new Set<string>();
  const out: { title: string; body: string }[] = [];

  for (const f of technicalFactors) {
    const title = formatTechnicalFactor(f);
    if (seen.has(title)) continue;
    seen.add(title);
    out.push({ title, body: explainTechnicalFactorKey(f) });
  }

  for (const d of keyDrivers) {
    const title = formatKeyDriver(d);
    if (seen.has(title)) continue;
    seen.add(title);
    out.push({ title, body: explainDriverKey(d) });
  }

  for (const r of riskFlags) {
    const title = formatKeyDriver(r);
    if (seen.has(title)) continue;
    seen.add(title);
    out.push({ title, body: explainRiskKey(r) });
  }

  return out.slice(0, maxItems);
}
