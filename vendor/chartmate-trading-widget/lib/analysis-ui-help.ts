/** Hover copy for post-analysis cards. Avoid em-dashes (they read as generic AI tone). */

export const HELP = {
  probabilityPanel:
    "Combines AI-derived probabilities with technical context for this symbol. All figures are model outputs for research, not financial advice or a recommendation to trade.",
  marketDirection:
    "Estimated chance price moves up, sideways, or down over the model horizon. Not a guarantee, since markets can gap on news. Sideways usually means consolidation or an unclear trend.",
  aiConfidence:
    "How strongly the combined model agrees with itself given your data. Low confidence means mixed signals. This is not the same as profit probability.",
  nextMoveScenarios:
    "A readable split of upward and downward totals into stronger vs moderate moves. Built from the same direction probabilities as the gauges above, not a second independent forecast.",
  pressureMap:
    "Bullish, neutral, and bearish pressure mirror the same up, sideways, and down probabilities. The top pin is net bias (up vs down), centered when they balance.",
  priceLevels:
    "Nearby support (S) and resistance (R) zones from the model. Red on R is the level type, not a prediction that price must fall.",
  priceLevelsCardGuide:
    "R means resistance: a zone where selling interest often appears (a ceiling). S means support: a zone where buying interest often appears (a floor). Red styling on R only labels resistance type; price can still be trending up with several resistance levels above it. Green S is the same idea for floors. The percentage is how much weight the model puts on price interacting with that zone before the forecast window ends, not a promise from the order book.",
  probTimeline:
    "Each row is one horizon from the same run. The number is modeled chance of an upward resolution before that horizon ends.",
  probTimelineCardGuide:
    "Left column: forecast horizon (how far ahead that row looks). Bar + percentage: estimated probability that price resolves upward before that time elapses, from the same model run as the gauges above (not a second forecast). Bar color: green if that horizon’s tagged direction is up, red if down, gray if sideways; the tiny arrow matches that tag. Compare rows to see whether upside odds rise or fade as the window lengthens. All rows use the snapshot from when you ran this analysis.",
  pressureMeter:
    "Blends directional odds, expected move, momentum, volume confirmation, and the model stance. When the meter pegs about 99 to 100% buyer side, the UI will say BUY explicitly because every input in this blend is maxed long. That is still not a profit promise.",
  volumeIntel:
    "24h volume vs recent average. Vol confirms move checks whether volume supports the lean; neutral volume often means the tape has not proven itself yet.",
  aiReasoningEngine:
    "Plain-language synthesis of what the run saw: drivers, risks, and context. This section explains the setup; it is not an order to trade.",
  aiReasoningTermGuideIntro:
    "This section turns jargon from the summary into plain English. Each line comes from rules applied to completed candles at the snapshot time, then blended by the model. They are context clues, not buy or sell commands.",
  aiReasoningMacdPrimer:
    "MACD means Moving Average Convergence Divergence. It compares a faster and a slower exponential average of price and plots how they diverge or come together. When the MACD line crosses the signal line, or the histogram flips positive or negative, the engine reads that as short-term momentum shifting on those bars only.",
  aiReasoningRsiPrimer:
    "RSI means Relative Strength Index, a 0 to 100 oscillator from recent up vs down closes. Very high or very low readings flag stretched conditions; they are not automatic entry or exit timers without chart context.",
  marketConditions:
    "Backdrop matches your symbol type: US equities use S&P/Nasdaq/Dow and VIX; India listings use Nifty/Sensex/Bank Nifty and India VIX; crypto uses BTC/ETH/SOL with a stress score; FX uses DXY and majors with a stress score. Your ticker can still diverge.",
  marketSentiment:
    "Blends local index moves and the volatility index into a simple mood label. This is backdrop, not a duplicate of your symbol analysis.",
  majorIndices:
    "Index levels and session change vs reference close. If you see 0.00% flat on all names, quotes may be between sessions or delayed, so refresh after the open.",
  vix:
    "For US equities this is VIX; for India it is India VIX; for crypto and FX it is a scaled stress read from major benchmarks, not CBOE VIX. Higher usually means wider swings and more care on size, not a direction call.",
  newsImpact:
    "Quick macro headline risk dial for this dashboard. For the symbol, use Recent Headlines, which pulls feeds when API keys are set.",
  aiInsights:
    "Structured list of what the pipeline surfaced. Repeated labels mean several blocks agree on the same theme.",
  newsHeadlines:
    "Headlines from news APIs and RSS when available. If you see a link, it opens the publisher. If not, the line is a summary only.",
  pipelineProgress:
    "Server steps for this run. A dash for time means the step was too fast to meter separately. The bar is completion share, not accuracy.",
  pipelineStep:
    "One job stage. A dash for duration means timing was not split out, not that nothing ran.",
  multiHorizonTable:
    "Each row is another horizon from the same run. Compare to how long you plan to stay in the trade.",
  analysisTimelineCard:
    "Pipeline order plus optional horizon countdowns. Timing is diagnostic only.",
  predictSymbol:
    "Search for a listed ticker: stocks, crypto pairs (e.g. BTC-USD), or forex. Choose the exact exchange and symbol the chart and AI should use. A mismatched symbol feeds the wrong data into the whole run.",
  predictTimeframe:
    "Sets how far ahead the model anchors its probability window (for example 1h or 1d). Shorter horizons react more to very recent movement; longer ones smooth the picture. Custom lets you enter values like 2h, 3d, or 1w when supported.",
  predictInvestment:
    "Notional amount used for position sizing, ROI scenarios, and stop or take-profit math in the report. Switch INR or USD to match how you size risk. Entering a number here does not place an order by itself.",
} as const;
