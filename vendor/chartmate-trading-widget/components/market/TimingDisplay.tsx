import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Globe, Calendar, Target, Zap, AlertCircle } from "lucide-react";
import { formatDateTime, formatTargetTime, getRelativeTime, calculateHorizonTime } from "@/lib/time";
import { supabase } from "@/integrations/supabase/client";

interface TimingDisplayProps {
  symbol: string;
  predictionData?: any;
  marketStatus?: any;
  userTimezone?: string;
}

interface TimezoneInfo {
  name: string;
  offset: string;
  currentTime: string;
}

export function TimingDisplay({ 
  symbol, 
  predictionData, 
  marketStatus: propMarketStatus, 
  userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone 
}: TimingDisplayProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [userLocalTime, setUserLocalTime] = useState(new Date());
  const [marketStatus, setMarketStatus] = useState<any>(propMarketStatus);
  const [loadingMarketStatus, setLoadingMarketStatus] = useState(false);

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      setUserLocalTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Fetch market status
  useEffect(() => {
    if (!symbol || propMarketStatus) return;

    const fetchMarketStatus = async () => {
      setLoadingMarketStatus(true);
      try {
        const { data, error } = await supabase.functions.invoke('get-market-status', {
          body: { symbol }
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        setMarketStatus(data);
      } catch (err) {
        console.error('Error fetching market status:', err);
        // Set fallback market status
        setMarketStatus({
          marketState: 'UNKNOWN',
          quoteType: 'EQUITY',
          exchangeTimezoneName: 'America/New_York'
        });
      } finally {
        setLoadingMarketStatus(false);
      }
    };

    fetchMarketStatus();
  }, [symbol, propMarketStatus]);

  // Get exchange timezone info
  const getExchangeTimezoneInfo = (): TimezoneInfo | null => {
    if (!marketStatus?.exchangeTimezoneName) return null;
    
    try {
      const exchangeTime = new Date().toLocaleString("en-US", {
        timeZone: marketStatus.exchangeTimezoneName,
        timeZoneName: "short"
      });
      
      const offset = new Date().toLocaleString("en-US", {
        timeZone: marketStatus.exchangeTimezoneName,
        timeZoneName: "longOffset"
      });
      
      return {
        name: marketStatus.exchangeTimezoneName,
        offset: offset,
        currentTime: exchangeTime
      };
    } catch {
      return null;
    }
  };

  // Get next market open time
  const getNextMarketOpen = () => {
    if (!marketStatus) return null;
    
    // For crypto/forex, always open
    if (marketStatus.quoteType === 'CRYPTOCURRENCY' || marketStatus.quoteType === 'FOREX') {
      return null;
    }
    
    // For equities, calculate next open
    if (marketStatus.marketState === 'CLOSED') {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 30, 0, 0); // Assume 9:30 AM open
      
      // If it's weekend, move to Monday
      if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
      if (tomorrow.getDay() === 6) tomorrow.setDate(tomorrow.getDate() + 2);
      
      return tomorrow;
    }
    
    return null;
  };

  // Get prediction timing info
  const getPredictionTiming = () => {
    if (!predictionData?.timestamp) return null;
    
    const predictedAt = new Date(predictionData.timestamp);
    const horizons = predictionData.hourlyPredictions || [];
    
    // Filter out invalid horizons and add fallbacks
    const validHorizons = horizons
      .filter((pred: any) => pred && pred.horizon) // Only include predictions with valid horizons
      .map((pred: any) => {
        try {
          const horizon = pred.horizon || '1h'; // Fallback to 1h if horizon is missing
          const targetTime = calculateHorizonTime(horizon, predictedAt);
          const status = new Date() >= targetTime ? 'expired' : 'active';
          
          return {
            horizon,
            targetTime,
            status
          };
        } catch (error) {
          console.warn('Error processing horizon:', pred.horizon, error);
          // Return a safe fallback
          return {
            horizon: '1h',
            targetTime: new Date(predictedAt.getTime() + 60 * 60 * 1000), // 1 hour from prediction
            status: 'active'
          };
        }
      });
    
    return {
      predictedAt,
      horizons: validHorizons
    };
  };

  const exchangeTz = getExchangeTimezoneInfo();
  const nextOpen = getNextMarketOpen();
  const predictionTiming = getPredictionTiming();

  return (
    <div className="space-y-4">
      {/* Current Time Display */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-blue-600" />
            Current Time
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* User Local Time */}
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-900">
                {userLocalTime.toLocaleTimeString()}
              </div>
              <div className="text-sm text-blue-700">
                Your Time ({userTimezone})
              </div>
            </div>

            {/* Exchange Time */}
            {exchangeTz && (
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-900">
                  {exchangeTz.currentTime}
                </div>
                <div className="text-sm text-indigo-700">
                  Exchange Time ({exchangeTz.name})
                </div>
              </div>
            )}

            {/* UTC Time */}
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {currentTime.toUTCString().split(' ')[4]}
              </div>
              <div className="text-sm text-gray-700">
                UTC
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Market Hours & Status */}
      <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5 text-green-600" />
            Market Hours & Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {marketStatus ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Market State:</span>
                <Badge variant={marketStatus.marketState === 'REGULAR' ? 'default' : 'secondary'}>
                  {marketStatus.marketState}
                </Badge>
              </div>
              
              {marketStatus.regularHours && (
                <div className="flex items-center justify-between">
                  <span className="font-medium">Regular Hours:</span>
                  <span className="text-sm text-gray-700">{marketStatus.regularHours}</span>
                </div>
              )}
              
              {nextOpen && (
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <span className="font-medium text-amber-800">Next Market Open:</span>
                  <div className="text-right">
                    <div className="font-bold text-amber-900">
                      {nextOpen.toLocaleDateString()} at {nextOpen.toLocaleTimeString()}
                    </div>
                    <div className="text-sm text-amber-700">
                      {getRelativeTime(nextOpen)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p>Market status not available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Timing */}
      {predictionTiming && (
        <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-secondary" />
              Analysis Timing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
              <span className="font-medium text-purple-800">Generated At:</span>
              <div className="text-right">
                <div className="font-bold text-purple-900">
                  {formatDateTime(predictionTiming.predictedAt)}
                </div>
                <div className="text-sm text-purple-700">
                  {getRelativeTime(predictionTiming.predictedAt)}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-purple-800">Analysis Horizons:</h4>
              {predictionTiming.horizons.map((horizon: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-2 bg-white rounded border border-purple-200">
                  <div className="flex items-center gap-2">
                    <Zap className={`h-4 w-4 ${horizon.status === 'active' ? 'text-green-600' : 'text-gray-400'}`} />
                    <span className="font-medium">{horizon.horizon}</span>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${horizon.status === 'active' ? 'text-green-900' : 'text-gray-500'}`}>
                      {formatTargetTime(horizon.targetTime)}
                    </div>
                    <div className={`text-sm ${horizon.status === 'active' ? 'text-green-700' : 'text-gray-400'}`}>
                      {horizon.status === 'active' ? 'Active' : 'Expired'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timezone Converter */}
      <Card className="bg-gradient-to-r from-orange-50 to-red-50 border-orange-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-orange-600" />
            Timezone Converter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-orange-800">
            <p className="mb-2">
              <strong>Your Location:</strong> {userTimezone}
            </p>
            {exchangeTz && (
              <p>
                <strong>Exchange Location:</strong> {exchangeTz.name} ({exchangeTz.offset})
              </p>
            )}
            <p className="mt-2 text-xs text-orange-600">
              All times are displayed in your local timezone for convenience.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
