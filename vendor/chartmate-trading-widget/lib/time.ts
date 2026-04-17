// Time utilities for prediction timeline and formatting

/** Pipeline steps often omit timing; avoid showing misleading “0ms”. */
export function formatPipelineDuration(milliseconds: number | undefined | null): string {
  if (milliseconds == null || milliseconds <= 0) return "—";
  return formatDuration(milliseconds);
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }
  
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function parseISO8601Duration(duration: string): number {
  // Parse ISO 8601 duration strings like "PT15M", "PT1H", "P1D"
  const match = duration.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  
  const [, days, hours, minutes, seconds] = match.map(val => val ? parseInt(val) : 0);
  
  return (
    days * 24 * 60 * 60 * 1000 +
    hours * 60 * 60 * 1000 +
    minutes * 60 * 1000 +
    seconds * 1000
  );
}

export function formatTimeRemaining(targetTime: Date, currentTime: Date = new Date()): string {
  const diff = targetTime.getTime() - currentTime.getTime();
  
  if (diff <= 0) {
    return "Expired";
  }
  
  const minutes = Math.floor(diff / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  
  return `${seconds}s`;
}

export function formatDateTime(date: Date, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  };
  
  if (timeZone) {
    options.timeZone = timeZone;
  }
  
  return new Intl.DateTimeFormat('en-US', options).format(date);
}

export function formatTargetTime(date: Date, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  };
  
  if (timeZone) {
    options.timeZone = timeZone;
  }
  
  return new Intl.DateTimeFormat('en-US', options).format(date);
}

export function getShortHorizonLabel(horizon: string | number): string {
  if (typeof horizon === 'number') {
    const minutes = horizon;
    if (minutes < 60) return `+${minutes}m`;
    if (minutes < 1440) return `+${Math.round(minutes / 60)}h`;
    if (minutes < 10080) return `+${Math.round(minutes / 1440)}d`;
    return `+${Math.round(minutes / 10080)}w`;
  }
  
  // Parse string horizons like "15m", "1h", "7d"
  const match = horizon.match(/^(\d+)([mhd])$/);
  if (match) {
    const [, value, unit] = match;
    return `+${value}${unit}`;
  }
  
  return `+${horizon}`;
}

export function horizonToMilliseconds(horizon: string | number): number {
  // Handle undefined or null horizons
  if (!horizon) {
    console.warn('horizonToMilliseconds: horizon is undefined or null, using 1h fallback');
    return 60 * 60 * 1000; // Default to 1 hour
  }
  
  // Handle numeric horizons (minutes) or string horizons ("1h", "4h", etc.)
  if (typeof horizon === 'number') {
    return horizon * 60 * 1000; // Convert minutes to milliseconds
  }
  
  // Handle string horizons
  if (typeof horizon === 'string') {
    // Parse string horizons like "15m", "1h", "7d"
    const match = horizon.match(/^(\d+)([mhd])$/);
    if (match) {
      const [, value, unit] = match;
      const num = parseInt(value);
      switch (unit) {
        case 'm': return num * 60 * 1000;
        case 'h': return num * 60 * 60 * 1000;
        case 'd': return num * 24 * 60 * 60 * 1000;
        default: return num * 60 * 60 * 1000;
      }
    }
    
    // Fallback to predefined timeframes
    const timeframeMs: Record<string, number> = {
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000
    };
    
    return timeframeMs[horizon] || 60 * 60 * 1000;
  }
  
  // Final fallback
  console.warn('horizonToMilliseconds: invalid horizon type:', typeof horizon, horizon);
  return 60 * 60 * 1000; // Default to 1 hour
}

export function calculateHorizonTime(
  horizon: string | number, 
  baseTime: Date = new Date()
): Date {
  try {
    const ms = horizonToMilliseconds(horizon);
    return new Date(baseTime.getTime() + ms);
  } catch (error) {
    console.warn('calculateHorizonTime: error calculating horizon time:', error);
    // Fallback to 1 hour from base time
    return new Date(baseTime.getTime() + 60 * 60 * 1000);
  }
}

export function getRelativeTime(date: Date, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();
  const absDiff = Math.abs(diff);
  
  if (absDiff < 60 * 1000) {
    return 'Just now';
  }
  
  if (absDiff < 60 * 60 * 1000) {
    const minutes = Math.floor(absDiff / (60 * 1000));
    return diff > 0 ? `${minutes}m ago` : `in ${minutes}m`;
  }
  
  if (absDiff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(absDiff / (60 * 60 * 1000));
    return diff > 0 ? `${hours}h ago` : `in ${hours}h`;
  }
  
  const days = Math.floor(absDiff / (24 * 60 * 60 * 1000));
  return diff > 0 ? `${days}d ago` : `in ${days}d`;
}

// New timezone and market timing functions
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatTimeInTimezone(date: Date, timezone: string): string {
  try {
    return date.toLocaleString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
  } catch {
    return date.toLocaleString();
  }
}

export function formatDateInTimezone(date: Date, timezone: string): string {
  try {
    return date.toLocaleDateString('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return date.toLocaleDateString();
  }
}

export function getTimezoneOffset(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset'
    });
    const parts = formatter.formatToParts(new Date());
    const offsetPart = parts.find(part => part.type === 'timeZoneName');
    return offsetPart?.value || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isMarketOpen(marketState: string, quoteType: string): boolean {
  if (quoteType === 'CRYPTOCURRENCY' || quoteType === 'FOREX') {
    return true; // Crypto and forex trade 24/7
  }
  
  return marketState === 'REGULAR' || marketState === 'PRE' || marketState === 'POST';
}

export function getNextMarketOpen(currentTime: Date = new Date()): Date {
  const nextOpen = new Date(currentTime);
  
  // Move to next business day
  do {
    nextOpen.setDate(nextOpen.getDate() + 1);
  } while (nextOpen.getDay() === 0 || nextOpen.getDay() === 6); // Skip weekends
  
  // Set to 9:30 AM (typical market open)
  nextOpen.setHours(9, 30, 0, 0);
  
  return nextOpen;
}

export function getMarketCloseTime(currentTime: Date = new Date()): Date {
  const closeTime = new Date(currentTime);
  
  // If it's weekend, move to Friday
  if (closeTime.getDay() === 0) closeTime.setDate(closeTime.getDate() - 2);
  if (closeTime.getDay() === 6) closeTime.setDate(closeTime.getDate() - 1);
  
  // Set to 4:00 PM (typical market close)
  closeTime.setHours(16, 0, 0, 0);
  
  return closeTime;
}

export function formatMarketHours(openTime: Date, closeTime: Date): string {
  const openStr = openTime.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
  const closeStr = closeTime.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
  
  return `${openStr} – ${closeStr}`;
}

export function getTimeUntilMarketOpen(marketStatus: any): string | null {
  if (!marketStatus || isMarketOpen(marketStatus.marketState, marketStatus.quoteType)) {
    return null;
  }
  
  const nextOpen = getNextMarketOpen();
  const now = new Date();
  const diff = nextOpen.getTime() - now.getTime();
  
  if (diff <= 0) return null;
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m until market opens`;
  }
  
  return `${minutes}m until market opens`;
}

export function formatPredictionTimestamp(timestamp: string | Date, userTimezone?: string): {
  localTime: string;
  relativeTime: string;
  timezone: string;
} {
  const date = new Date(timestamp);
  const tz = userTimezone || getUserTimezone();
  
  return {
    localTime: formatTimeInTimezone(date, tz),
    relativeTime: getRelativeTime(date),
    timezone: tz
  };
}