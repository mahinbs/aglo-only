import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import TradingViewWidget from './TradingViewWidget';
import { BarChart3, Loader2 } from 'lucide-react';

interface ChartPanelProps {
  defaultSymbol?: string;
  /** When set, the chart automatically shows this symbol (e.g. from Predict page selection). Updates when value changes. */
  syncSymbol?: string;
  defaultInterval?: string;
  onAnalyzeChart?: (symbol: string, interval: string) => void;
  isAnalyzing?: boolean;
}

const POPULAR_SYMBOLS = [
  { value: "NASDAQ:AAPL", label: "Apple (AAPL)" },
  { value: "NASDAQ:GOOGL", label: "Google (GOOGL)" },
  { value: "NASDAQ:MSFT", label: "Microsoft (MSFT)" },
  { value: "NASDAQ:TSLA", label: "Tesla (TSLA)" },
  { value: "NYSE:SPY", label: "S&P 500 ETF (SPY)" },
  { value: "NASDAQ:QQQ", label: "Nasdaq ETF (QQQ)" },
  { value: "BINANCE:BTCUSDT", label: "Bitcoin (BTC)" },
  { value: "BINANCE:ETHUSDT", label: "Ethereum (ETH)" },
  { value: "OANDA:EUR_USD", label: "EUR/USD" },
  { value: "OANDA:GBP_USD", label: "GBP/USD" },
  { value: "OANDA:USD_JPY", label: "USD/JPY" },
];

const INTERVALS = [
  { value: "1", label: "1m" },
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "60", label: "1h" },
  { value: "240", label: "4h" },
  { value: "D", label: "1D" },
  { value: "W", label: "1W" },
];

export default function ChartPanel({ defaultSymbol = "NASDAQ:AAPL", syncSymbol, defaultInterval = "D", onAnalyzeChart, isAnalyzing = false }: ChartPanelProps) {
  const [symbol, setSymbol] = useState(syncSymbol || defaultSymbol);
  const [interval, setInterval] = useState(defaultInterval);

  // When parent passes a selected stock (e.g. from Predict page), keep chart in sync
  useEffect(() => {
    if (syncSymbol && syncSymbol.trim()) setSymbol(syncSymbol.trim());
  }, [syncSymbol]);

  return (
    <Card className="glass-panel h-full flex flex-col border-white/5">
      <CardHeader className="pb-2 sm:pb-3 relative z-10">
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center mb-2">
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="flex-1 bg-zinc-950/50 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POPULAR_SYMBOLS.map((sym) => (
                <SelectItem key={sym.value} value={sym.value}>
                  {sym.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={interval} onValueChange={setInterval}>
            <SelectTrigger className="w-full sm:w-20 bg-zinc-950/50 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((int) => (
                <SelectItem key={int.value} value={int.value}>
                  {int.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {onAnalyzeChart && (
          <Button
            onClick={() => onAnalyzeChart(symbol, interval)}
            disabled={isAnalyzing}
            variant="outline"
            size="sm"
            className="w-full border-white/10 hover:bg-white/5"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing Chart...
              </>
            ) : (
              <>
                <BarChart3 className="mr-2 h-4 w-4" />
                Analyze Current Chart
              </>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div className="h-full bg-background/50 backdrop-blur-sm">
          <TradingViewWidget symbol={symbol} interval={interval} />
        </div>
      </CardContent>
    </Card>
  );
}
