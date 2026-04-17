import { horizonToMilliseconds } from './time';

interface MarketStatus {
  isRegularOpen?: boolean;
  nextRegularOpen?: string;
  todayRegularOpen?: string;
  todayRegularClose?: string;
  exchangeTimezoneName?: string;
  marketState?: string;
  quoteType?: string;
}

/**
 * Calculate the effective start time for a prediction, considering market hours
 * For closed markets, predictions start when the market reopens
 */
export function getEffectiveStart(predictedAt: Date, marketStatus?: MarketStatus): Date {
  if (!marketStatus) return predictedAt;

  const { isRegularOpen, nextRegularOpen, quoteType } = marketStatus;

  // Crypto and forex trade 24/7 or 24/5 - start immediately
  if (quoteType === 'CRYPTOCURRENCY' || quoteType === 'CURRENCY' || quoteType === 'FOREX') {
    return predictedAt;
  }

  // If market is open, start immediately
  if (isRegularOpen) {
    return predictedAt;
  }

  // If market is closed and we have next open time, use that
  if (nextRegularOpen) {
    const nextOpen = new Date(nextRegularOpen);
    // Only defer if next open is in the future and within reasonable range (next 7 days)
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    if (nextOpen > now && nextOpen <= weekFromNow) {
      return nextOpen;
    }
  }

  // Fallback to immediate start
  return predictedAt;
}

/**
 * Calculate the effective target time for a horizon, based on the effective start
 */
export function getEffectiveTarget(horizon: string | number, effectiveStart: Date): Date {
  const horizonMs = horizonToMilliseconds(horizon);
  return new Date(effectiveStart.getTime() + horizonMs);
}

/**
 * Check if a prediction should start timing now or wait for market open
 */
export function shouldStartTiming(predictedAt: Date, marketStatus?: MarketStatus): boolean {
  if (!marketStatus) return true;
  
  const effectiveStart = getEffectiveStart(predictedAt, marketStatus);
  const now = new Date();
  
  return now >= effectiveStart;
}

/**
 * Get a human-readable status for when the prediction timing starts
 */
export function getTimingStatus(predictedAt: Date, marketStatus?: MarketStatus): {
  status: 'active' | 'waiting';
  message: string;
} {
  if (!marketStatus) {
    return { status: 'active', message: 'Live timing' };
  }

  const effectiveStart = getEffectiveStart(predictedAt, marketStatus);
  const now = new Date();

  if (now >= effectiveStart) {
    return { status: 'active', message: 'Live timing' };
  }

  const { quoteType } = marketStatus;
  
  // For equities, explain market closure
  if (quoteType === 'EQUITY') {
    return { 
      status: 'waiting', 
      message: 'Starts when market opens' 
    };
  }

  return { status: 'active', message: 'Live timing' };
}