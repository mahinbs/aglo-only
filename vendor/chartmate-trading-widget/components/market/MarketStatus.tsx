import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, Clock, Moon, Power, Activity, Globe, AlertTriangle } from "lucide-react";

interface MarketStatusProps {
  symbol: string;
  displaySymbol?: string;
  exchange?: string;
  type?: string;
}

interface MarketStatusResponse {
  symbol: string;
  exchange: string;
  exchangeTimezoneName: string;
  marketState: string;
  quoteType: string;
  label: string;
  regularHours: string;
  timestamp: string;
}

export function MarketStatus({ symbol, displaySymbol, exchange, type }: MarketStatusProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<MarketStatusResponse | null>(null);

  useEffect(() => {
    if (!symbol) return;

    const fetchMarketStatus = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: invokeError } = await supabase.functions.invoke('get-market-status', {
          body: { symbol, exchange, type }
        });

        if (invokeError) {
          throw new Error(invokeError.message);
        }

        if (data.error) {
          throw new Error(data.error);
        }

        setStatus(data);
      } catch (err) {
        console.error('Market status error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch market status');
      } finally {
        setLoading(false);
      }
    };

    fetchMarketStatus();
  }, [symbol]);

  const getStatusIcon = (marketState: string) => {
    switch (marketState) {
      case 'REGULAR':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'PRE':
      case 'POST':
        return <Clock className="h-4 w-4 text-amber-600" />;
      case 'CLOSED':
        return <Power className="h-4 w-4 text-gray-500" />;
      case 'LIVE_24_7':
        return <Activity className="h-4 w-4 text-green-600" />;
      case 'LIVE_24_5':
        return <Globe className="h-4 w-4 text-green-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusVariant = (marketState: string) => {
    switch (marketState) {
      case 'REGULAR':
      case 'LIVE_24_7':
      case 'LIVE_24_5':
        return 'default';
      case 'PRE':
      case 'POST':
        return 'secondary';
      case 'CLOSED':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getStatusMessage = (marketState: string, regularHours: string) => {
    switch (marketState) {
      case 'REGULAR':
        return 'Regular trading session is active.';
      case 'PRE':
        return `Pre-market session. Regular session opens at ${regularHours.split('–')[0].trim()}.`;
      case 'POST':
        return `After-hours session. Regular session closed at ${regularHours.split('–')[1]?.trim() || '4:00 PM'}.`;
      case 'CLOSED':
        // Note: regularHours is already shown on the line above, so just say it's closed.
        return 'Currently outside regular trading hours (Mon–Fri).';
      case 'LIVE_24_7':
        return 'Trades continuously, 24 hours a day, 7 days a week.';
      case 'LIVE_24_5':
        return 'Trades Sunday evening to Friday evening (global forex hours).';
      default:
        return 'Market hours vary by venue.';
    }
  };

  if (loading) {
    return (
      <Card className="bg-muted/30 border-muted">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert className="bg-destructive/10 border-destructive/20">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Unable to fetch market status: {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (!status) return null;

  return (
    <Card className="bg-muted/30 border-muted">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          {getStatusIcon(status.marketState)}
          <div className="flex-1 space-y-1 sm:space-y-2">
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
              <Badge variant={getStatusVariant(status.marketState)} className="font-medium text-xs">
                {status.label}
              </Badge>
              {status.exchange && status.exchange !== 'Unknown' && (
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {/* Show friendly exchange name */}
                  {status.exchangeTimezoneName === 'Asia/Kolkata'
                    ? 'NSE / BSE'
                    : status.exchange === 'NMS' ? 'NASDAQ'
                    : status.exchange}
                </span>
              )}
              {status.exchangeTimezoneName && status.exchangeTimezoneName !== 'UTC' && (
                <span className="text-xs text-muted-foreground">
                  {/* Show friendly timezone label */}
                  ({status.exchangeTimezoneName === 'Asia/Kolkata' ? 'IST'
                    : status.exchangeTimezoneName === 'America/New_York' ? 'ET'
                    : status.exchangeTimezoneName === 'Europe/London' ? 'GMT/BST'
                    : status.exchangeTimezoneName === 'Asia/Tokyo' ? 'JST'
                    : status.exchangeTimezoneName === 'Asia/Hong_Kong' ? 'HKT'
                    : status.exchangeTimezoneName})
                </span>
              )}
            </div>
            
            <div className="space-y-1">
              {status.regularHours && status.regularHours !== 'Regular hours vary by venue' && (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Regular hours: {status.regularHours}
                </p>
              )}
              <p className="text-xs sm:text-sm text-muted-foreground">
                {getStatusMessage(status.marketState, status.regularHours)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}