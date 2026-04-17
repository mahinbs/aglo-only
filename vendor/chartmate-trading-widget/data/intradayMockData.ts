// Mock data for intraday predictions
export interface IntradayPrediction {
  symbol: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  timestamp: string;
  hourlyPredictions: HourlyPrediction[];
  overallTrend: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  keyLevels: {
    support: number[];
    resistance: number[];
  };
  volumeProfile: {
    highVolume: number[];
    lowVolume: number[];
  };
  momentum: {
    rsi: number;
    macd: number;
    macdSignal: number;
    strength: number;
  };
}

export interface HourlyPrediction {
  hour: string;
  time: string;
  direction: 'up' | 'down' | 'sideways';
  probability: number;
  expectedMove: number;
  confidence: number;
  keyFactors: string[];
  riskFactors: string[];
  volume: 'high' | 'normal' | 'low';
  volatility: 'low' | 'normal' | 'high';
}

export const mockIntradayData: IntradayPrediction = {
  symbol: 'AAPL',
  currentPrice: 185.50,
  change: 2.30,
  changePercent: 1.26,
  timestamp: new Date().toISOString(),
  hourlyPredictions: [
    {
      hour: '9:00 AM',
      time: '09:00',
      direction: 'up',
      probability: 0.75,
      expectedMove: 0.8,
      confidence: 85,
      keyFactors: ['Opening gap', 'Pre-market momentum', 'Volume surge'],
      riskFactors: ['Market volatility', 'News events'],
      volume: 'high',
      volatility: 'high'
    },
    {
      hour: '10:00 AM',
      time: '10:00',
      direction: 'up',
      probability: 0.70,
      expectedMove: 0.6,
      confidence: 80,
      keyFactors: ['Trend continuation', 'Volume confirmation'],
      riskFactors: ['Profit taking', 'Resistance level'],
      volume: 'normal',
      volatility: 'normal'
    },
    {
      hour: '11:00 AM',
      time: '11:00',
      direction: 'sideways',
      probability: 0.60,
      expectedMove: 0.3,
      confidence: 70,
      keyFactors: ['Consolidation', 'Support level'],
      riskFactors: ['Low volume', 'Range bound'],
      volume: 'low',
      volatility: 'low'
    },
    {
      hour: '12:00 PM',
      time: '12:00',
      direction: 'down',
      probability: 0.65,
      expectedMove: 0.5,
      confidence: 75,
      keyFactors: ['Lunch hour', 'Profit taking'],
      riskFactors: ['Low liquidity', 'News events'],
      volume: 'low',
      volatility: 'normal'
    },
    {
      hour: '1:00 PM',
      time: '13:00',
      direction: 'up',
      probability: 0.70,
      expectedMove: 0.7,
      confidence: 80,
      keyFactors: ['Afternoon momentum', 'Volume pickup'],
      riskFactors: ['Resistance level', 'Market sentiment'],
      volume: 'normal',
      volatility: 'normal'
    },
    {
      hour: '2:00 PM',
      time: '14:00',
      direction: 'up',
      probability: 0.75,
      expectedMove: 0.9,
      confidence: 85,
      keyFactors: ['Power hour', 'High volume', 'Trend strength'],
      riskFactors: ['Profit taking', 'End of day'],
      volume: 'high',
      volatility: 'high'
    },
    {
      hour: '3:00 PM',
      time: '15:00',
      direction: 'sideways',
      probability: 0.55,
      expectedMove: 0.2,
      confidence: 65,
      keyFactors: ['End of day', 'Position squaring'],
      riskFactors: ['Low volume', 'Market close'],
      volume: 'low',
      volatility: 'low'
    },
    {
      hour: '4:00 PM',
      time: '16:00',
      direction: 'down',
      probability: 0.60,
      expectedMove: 0.4,
      confidence: 70,
      keyFactors: ['Market close', 'After hours'],
      riskFactors: ['Low liquidity', 'Extended hours'],
      volume: 'low',
      volatility: 'normal'
    }
  ],
  overallTrend: 'bullish',
  confidence: 82,
  riskLevel: 'medium',
  keyLevels: {
    support: [183.20, 182.50, 181.80],
    resistance: [186.80, 187.50, 188.20]
  },
  volumeProfile: {
    highVolume: [185.50, 186.20],
    lowVolume: [184.80, 185.20]
  },
  momentum: {
    rsi: 65.4,
    macd: 0.25,
    macdSignal: 0.18,
    strength: 0.75
  }
};
