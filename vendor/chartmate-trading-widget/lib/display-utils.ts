// Utility functions to convert raw backend values to human-readable display text

/**
 * Convert technical indicator codes to human-readable labels
 */
export function formatTechnicalFactor(factor: string): string {
  const mapping: Record<string, string> = {
    // RSI
    'oversold_rsi': 'RSI oversold (below 30) - potential reversal',
    'overbought_rsi': 'RSI overbought (above 70) - potential pullback',
    'rsi_bullish': 'RSI showing bullish momentum',
    'rsi_bearish': 'RSI showing bearish momentum',
    
    // MACD
    'macd_bearish': 'MACD bearish crossover detected',
    'macd_bullish': 'MACD bullish crossover detected',
    'macd_momentum_bearish': 'MACD momentum turning negative',
    'macd_momentum_bullish': 'MACD momentum turning positive',
    
    // Bollinger Bands
    'bb_lower_band': 'Price near lower Bollinger Band',
    'bb_upper_band': 'Price near upper Bollinger Band',
    'bb_squeeze': 'Bollinger Band squeeze - volatility breakout expected',
    
    // Volume
    'volume_trend_bearish': 'Volume declining with bearish trend',
    'volume_trend_bullish': 'Volume increasing with bullish trend',
    'high_volume': 'Abnormally high trading volume',
    'low_volume': 'Low trading volume',
    
    // Moving Averages
    'ma_golden_cross': 'Golden cross - bullish signal',
    'ma_death_cross': 'Death cross - bearish signal',
    'above_ma': 'Price trading above moving average',
    'below_ma': 'Price trading below moving average',
    
    // Momentum
    'strong_momentum_bearish': 'Strong downward momentum',
    'strong_momentum_bullish': 'Strong upward momentum',
    'mean_reversion_bearish': 'Price reverting to mean - bearish',
    'mean_reversion_bullish': 'Price reverting to mean - bullish',
    
    // Support/Resistance
    'near_support': 'Price approaching support level',
    'near_resistance': 'Price approaching resistance level',
    'breakout_resistance': 'Price broke above resistance',
    'breakdown_support': 'Price broke below support',
  };

  return mapping[factor] || factor.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Convert key driver codes to human-readable labels
 */
export function formatKeyDriver(driver: string): string {
  const mapping: Record<string, string> = {
    // AI & Model drivers
    'quantum_ensemble': 'Advanced quantum ensemble prediction model',
    'market_regime_awareness': 'Market regime change detection',
    
    // Technical drivers
    'momentum_strength': 'Strong price momentum detected',
    'volume_confirmation': 'Volume confirms price movement',
    'trend_alignment': 'Multiple trend indicators aligned',
    'pattern_recognition': 'Technical pattern identified',
    
    // Sentiment & News
    'sentiment_analysis': 'Market sentiment analysis',
    'news_impact': 'Recent news impact on stock',
    
    // Volatility & Risk
    'volatility_analysis': 'Volatility pattern analysis',
    'market_volatility': 'High market volatility detected',
    'regime_change': 'Market regime shift in progress',
    
    // Fundamentals
    'earnings_beat': 'Earnings exceeded expectations',
    'earnings_miss': 'Earnings below expectations',
    'fundamental_strength': 'Strong fundamental indicators',
    
    // Institutional Activity
    'institutional_buying': 'Institutional buying activity detected',
    'institutional_selling': 'Institutional selling activity detected',
    
    // Additional technical factors
    'breakout_potential': 'Breakout pattern forming',
    'reversal_signal': 'Potential reversal signal detected',
    'consolidation': 'Price consolidation phase',
    'divergence': 'Technical divergence observed',
  };

  return mapping[driver] || driver.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Convert pattern codes to human-readable labels
 */
export function formatPattern(pattern: string): string {
  const mapping: Record<string, string> = {
    'oversold_rsi': 'Oversold (RSI < 30)',
    'overbought_rsi': 'Overbought (RSI > 70)',
    'macd_bearish': 'MACD Bearish Cross',
    'macd_bullish': 'MACD Bullish Cross',
    'macd_momentum_bearish': 'MACD Bearish Momentum',
    'macd_momentum_bullish': 'MACD Bullish Momentum',
    'bb_lower_band': 'At Lower BB',
    'bb_upper_band': 'At Upper BB',
    'volume_trend_bearish': 'Declining Volume',
    'volume_trend_bullish': 'Rising Volume',
    'strong_momentum_bearish': 'Strong Downtrend',
    'strong_momentum_bullish': 'Strong Uptrend',
    'mean_reversion_bearish': 'Mean Reversion Down',
    'mean_reversion_bullish': 'Mean Reversion Up',
  };

  return mapping[pattern] || pattern.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Format currency consistently.
 * @param currency - 'INR' (₹) or 'USD' ($). Default USD for backward compatibility.
 */
export function formatCurrency(
  amount: number,
  decimals: number = 2,
  allowNegative: boolean = false,
  currency: "INR" | "USD" = "USD"
): string {
  const absAmount = Math.abs(amount);
  const locale = currency === "INR" ? "en-IN" : "en-US";
  const formatted = absAmount.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const symbol = currency === "INR" ? "₹" : "$";
  if (allowNegative && amount < 0) {
    return `-${symbol}${formatted}`;
  }
  return `${symbol}${formatted}`;
}

/**
 * Pick fraction digits so a positive amount does not format as all zeros at the minimum precision
 * (e.g. EUR/USD spot change ~0.00046 with min 3 → use 4+).
 */
export function fractionDigitsToShowNonZero(
  absValue: number,
  minimumFractionDigits: number,
  maximumFractionDigits = 8,
): number {
  if (!Number.isFinite(absValue) || absValue <= 0) {
    return minimumFractionDigits;
  }
  for (let d = minimumFractionDigits; d <= maximumFractionDigits; d++) {
    if (Number(absValue.toFixed(d)) > 0) {
      return d;
    }
  }
  return maximumFractionDigits;
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 2, includeSign: boolean = true): string {
  const sign = includeSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format pipeline step names to human-readable labels
 */
export function formatPipelineStep(stepName: string): string {
  const mapping: Record<string, string> = {
    // Symbol validation
    'symbol_validation': 'Symbol Validation',
    'validate_symbol': 'Validating Symbol',
    
    // Market data
    'market_data': 'Market Data',
    'fetch_market_data': 'Fetching Market Data',
    'historical_data': 'Historical Analysis',
    'historical_analysis': 'Historical Analysis',
    'real_time_data': 'Real-Time Data',
    
    // Technical analysis
    'technical_indicators': 'Technical Indicators',
    'technical_analysis': 'Technical Analysis',
    'calculate_indicators': 'Calculating Indicators',
    
    // Market regime
    'market_regime_detection': 'Market Regime Detection',
    'regime_detection': 'Market Regime Analysis',
    'market_regime': 'Market Regime',
    
    // Enhanced analysis
    'enhanced_data_analysis': 'Enhanced Data Analysis',
    'enhanced_analysis': 'Advanced Analysis',
    'deep_analysis': 'Deep Market Analysis',
    
    // News & sentiment
    'news_sentiment': 'News Sentiment',
    'news_analysis': 'News Analysis',
    'sentiment_analysis': 'Sentiment Analysis',
    
    // AI & Predictions
    'ai_analysis': 'AI Analysis',
    'quantum_prediction': 'AI Prediction Model',
    'quantum_ensemble': 'Advanced AI Ensemble',
    'quantum_godly_plan': 'Advanced AI Analysis',
    'gemini_analysis': 'AI Prediction Engine',
    
    // Multi-horizon forecasts
    'multi_horizon_forecast': 'Multi-Horizon Forecast',
    'forecast_generation': 'Generating Forecasts',
    'horizon_analysis': 'Analyzing Time Horizons',
    
    // Risk assessment
    'risk_assessment': 'Risk Assessment',
    'risk_analysis': 'Risk Analysis',
    'calculate_risk': 'Calculating Risk Factors',
    
    // Final steps
    'recommendation': 'Final Recommendation',
    'generate_report': 'Generating Report',
    'finalize': 'Finalizing Analysis',
  };

  return mapping[stepName] || stepName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
