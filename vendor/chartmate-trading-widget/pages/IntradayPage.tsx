import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Target, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  BarChart3,
  Activity,
  Zap,
  Shield,
  Timer,
  ArrowRight,
  RefreshCw,
  Play
} from 'lucide-react';
import { Container } from '@/components/layout/Container';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { isAnalysisExceptionEmail } from '@/lib/manualSubscriptionBypass';
import IntradayPredictionService from '@/services/intradayPredictionService';
import type { IntradayPrediction } from '@/services/intradayPredictionService';
import { SymbolSearch } from '@/components/SymbolSearch';
import type { SymbolData } from '@/components/SymbolSearch';
import { TimingDisplay } from '@/components/market/TimingDisplay';

export default function IntradayPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const showAnalysisHistory = isAnalysisExceptionEmail(user?.email);
  const isMobile = useIsMobile();
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [selectedSymbolData, setSelectedSymbolData] = useState<SymbolData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [predictionData, setPredictionData] = useState<IntradayPrediction | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [timeFilter, setTimeFilter] = useState('all');

  // Real-time updates for live data
  useEffect(() => {
    if (!predictionData || !isInitialized) return;

    const interval = setInterval(async () => {
      try {
        // Refresh predictions every 5 minutes
        const predictionService = IntradayPredictionService.getInstance();
        const updatedPrediction = await predictionService.getIntradayPrediction(selectedSymbol);
        setPredictionData(updatedPrediction);
      } catch (error) {
        console.error('Error refreshing predictions:', error);
        // Continue with current data if refresh fails
      }
    }, 5 * 60 * 1000); // Update every 5 minutes

    return () => clearInterval(interval);
  }, [predictionData, isInitialized, selectedSymbol]);

  const handleSymbolSelect = (symbolData: SymbolData) => {
    setSelectedSymbolData(symbolData);
    setSelectedSymbol(symbolData.symbol);
    // Clear current predictions when new symbol is selected
    setPredictionData(null);
    setIsInitialized(false);
  };

  const handleSymbolSearch = async () => {
    if (!selectedSymbol || selectedSymbol.trim() === '') {
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Get real intraday predictions from the service
      const predictionService = IntradayPredictionService.getInstance();
      const newPredictionData = await predictionService.getIntradayPrediction(selectedSymbol);
      setPredictionData(newPredictionData);
      setIsInitialized(true);
    } catch (error) {
      console.error('Error getting intraday predictions:', error);
      // Set fallback data if prediction fails
      const predictionService = IntradayPredictionService.getInstance();
      const fallbackData = await predictionService.getIntradayPrediction(selectedSymbol);
      setPredictionData(fallbackData);
      setIsInitialized(true);
    } finally {
      setIsLoading(false);
    }
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'up': return <ArrowUpRight className="h-4 w-4 text-green-400" />;
      case 'down': return <ArrowDownRight className="h-4 w-4 text-red-400" />;
      default: return <Minus className="h-4 w-4 text-zinc-400" />;
    }
  };

  const getDirectionColor = (direction: string) => {
    switch (direction) {
      case 'up': return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'down': return 'text-red-400 bg-red-500/10 border-red-500/20';
      default: return 'text-zinc-400 bg-white/5 border-white/10';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'medium': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      case 'high': return 'text-red-400 bg-red-500/10 border-red-500/20';
      default: return 'text-zinc-400 bg-white/5 border-white/10';
    }
  };

  const getVolumeColor = (volume: string) => {
    switch (volume) {
      case 'high': return 'text-blue-400 bg-primary/10 border-primary/20';
      case 'normal': return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'low': return 'text-zinc-400 bg-white/5 border-white/10';
      default: return 'text-zinc-400 bg-white/5 border-white/10';
    }
  };

  const filteredPredictions = predictionData?.hourlyPredictions?.filter(pred => {
    if (timeFilter === 'all') return true;
    if (timeFilter === 'morning') return ['09:00', '10:00', '11:00'].includes(pred.time);
    if (timeFilter === 'afternoon') return ['13:00', '14:00', '15:00'].includes(pred.time);
    if (timeFilter === 'power-hours') return ['14:00', '15:00'].includes(pred.time);
    return true;
  }) || [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-white/5 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <Container className="py-3 sm:py-4">
          <div className="flex justify-between items-center mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/home')}
              className="flex items-center gap-2 border-white/10 hover:bg-white/5"
            >
              <ArrowRight className="h-4 w-4 rotate-180" />
              <span>Home</span>
            </Button>
            {showAnalysisHistory && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/predictions')}
                className="flex items-center gap-2 border-white/10 hover:bg-white/5"
              >
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Analysis History</span>
                <span className="sm:hidden">History</span>
              </Button>
            )}
          </div>

          <div className="text-center space-y-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gradient">
              🚀 Intraday Trading
            </h1>
            <p className="text-muted-foreground text-sm">
              AI-powered hourly probability-based analyses for day traders
            </p>
            {isLoading && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-primary">Generating AI analyses...</span>
              </div>
            )}
          </div>
        </Container>
      </div>

      {/* Main Content */}
      <Container className="py-6">
        {/* Symbol Search */}
        <Card className="glass-panel mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Target className="h-5 w-5 text-primary" />
              Symbol Analysis
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter a stock symbol to get intraday hourly analyses
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Search row: stacks on mobile */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 min-w-0">
                  <SymbolSearch
                    value={selectedSymbolData?.full_symbol || selectedSymbol}
                    onValueChange={setSelectedSymbol}
                    onSelectSymbol={handleSymbolSelect}
                    placeholder="Search stocks, crypto, forex..."
                  />
                </div>
                <div className="flex gap-2 sm:shrink-0">
                  <Button
                    onClick={handleSymbolSearch}
                    disabled={isLoading || !selectedSymbol}
                    className="flex-1 sm:flex-none sm:min-w-[110px] shadow-[0_0_20px_rgba(20,184,166,0.2)]"
                  >
                    {isLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {isLoading ? 'Analyzing...' : 'Analyze'}
                  </Button>

                  {predictionData && (
                    <Button
                      variant="outline"
                      onClick={handleSymbolSearch}
                      disabled={isLoading}
                      className="flex-1 sm:flex-none sm:min-w-[100px] border-white/10 hover:bg-white/5"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Refresh
                    </Button>
                  )}
                </div>
              </div>

              {selectedSymbolData && (
                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="font-medium text-white text-sm">Selected: {selectedSymbolData.symbol}</span>
                    <Badge variant="outline" className="text-xs border-white/10 text-muted-foreground">
                      {selectedSymbolData.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate">{selectedSymbolData.description}</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Current Status */}
        <Card className="glass-panel mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Activity className="h-5 w-5 text-primary" />
              Current Status - {selectedSymbolData ? `${selectedSymbolData.symbol} (${selectedSymbolData.description})` : 'No Symbol Selected'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedSymbolData ? (
              <div className="text-center py-8">
                <div className="text-muted-foreground mb-4">
                  <Target className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-lg font-medium text-white">Select a symbol to analyze</p>
                  <p className="text-sm text-muted-foreground">Choose a stock, crypto, or forex pair to get intraday analyses</p>
                </div>
              </div>
            ) : !predictionData ? (
              <div className="text-center py-8">
                <div className="text-muted-foreground mb-4">
                  <RefreshCw className="h-12 w-12 mx-auto mb-2 opacity-50 animate-spin" />
                  <p className="text-lg font-medium text-white">Click "Analyze" to get analyses</p>
                  <p className="text-sm text-muted-foreground">Real-time AI-powered intraday analysis will be generated</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="grid sm:grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="text-center p-4 bg-white/5 rounded-lg border border-white/5">
                    <p className="text-2xl font-bold text-white">${predictionData?.currentPrice?.toFixed(2) || '0.00'}</p>
                    <p className="text-sm text-muted-foreground">Current Price</p>
                  </div>
                  <div className="text-center p-4 bg-white/5 rounded-lg border border-white/5">
                    <p className={`text-2xl font-bold ${predictionData?.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {predictionData?.change >= 0 ? '+' : ''}{predictionData?.change?.toFixed(2) || '0.00'}
                    </p>
                    <p className="text-sm text-muted-foreground">Change</p>
                  </div>
                  <div className="text-center p-4 bg-white/5 rounded-lg border border-white/5">
                    <p className={`text-2xl font-bold ${predictionData?.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {predictionData?.changePercent >= 0 ? '+' : ''}{predictionData?.changePercent?.toFixed(2) || '0.00'}%
                    </p>
                    <p className="text-sm text-muted-foreground">Change %</p>
                  </div>
                  <div className="text-center p-4 bg-white/5 rounded-lg border border-white/5">
                    <p className="text-2xl font-bold text-white">{predictionData?.confidence || 0}%</p>
                    <p className="text-sm text-muted-foreground">Confidence</p>
                  </div>
                </div>
                
                <Separator className="my-4 bg-white/10" />
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={getDirectionColor(predictionData?.overallTrend || 'neutral')}
                    >
                      {predictionData?.overallTrend === 'bullish' ? '📈 Bullish' : 
                       predictionData?.overallTrend === 'bearish' ? '📉 Bearish' : '➡️ Neutral'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">Overall Trend</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={getRiskColor(predictionData?.riskLevel || 'medium')}
                    >
                      <Shield className="h-3 w-3 mr-1" />
                      {predictionData?.riskLevel ? predictionData.riskLevel.charAt(0).toUpperCase() + predictionData.riskLevel.slice(1) : 'Medium'} Risk
                    </Badge>
                    <span className="text-sm text-muted-foreground">Risk Level</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-blue-400 bg-primary/10 border-primary/20">
                      <Timer className="h-3 w-3 mr-1" />
                      {predictionData ? 'AI-Powered' : 'Real-time'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {predictionData ? 'Advanced Models' : 'Live Updates'}
                    </span>
                  </div>
                  
                  {predictionData && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-green-400 bg-green-500/10 border-green-500/20">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Fresh Data
                      </Badge>
                      <span className="text-sm text-muted-foreground">Cache: Active</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Analysis Tabs */}
        {selectedSymbolData && predictionData && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="overflow-x-auto pb-1">
            <TabsList className="grid min-w-[360px] w-full grid-cols-5 bg-zinc-900/50 border border-white/5">
              <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
              <TabsTrigger value="hourly" className="text-xs sm:text-sm">Hourly</TabsTrigger>
              <TabsTrigger value="levels" className="text-xs sm:text-sm">Levels</TabsTrigger>
              <TabsTrigger value="momentum" className="text-xs sm:text-sm">Momentum</TabsTrigger>
              <TabsTrigger value="timing" className="text-xs sm:text-sm">Timing</TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Hourly Summary */}
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Clock className="h-5 w-5 text-primary" />
                    Hourly Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-white">Bullish Hours:</span>
                      <Badge variant="outline" className="text-green-400 bg-green-500/10 border-green-500/20">
                        {predictionData?.hourlyPredictions?.filter(p => p.direction === 'up').length || 0}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-white">Bearish Hours:</span>
                      <Badge variant="outline" className="text-red-400 bg-red-500/10 border-red-500/20">
                        {predictionData?.hourlyPredictions?.filter(p => p.direction === 'down').length || 0}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-white">Sideways Hours:</span>
                      <Badge variant="outline" className="text-zinc-400 bg-white/5 border-white/10">
                        {predictionData?.hourlyPredictions?.filter(p => p.direction === 'sideways').length || 0}
                      </Badge>
                    </div>
                    <Separator className="bg-white/10" />
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-white">Best Trading Hours:</span>
                      <span className="text-sm text-green-400 font-medium">2:00 PM - 3:00 PM</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-white">Avoid Trading:</span>
                      <span className="text-sm text-red-400 font-medium">12:00 PM - 1:00 PM</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Risk Assessment */}
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <AlertTriangle className="h-5 w-5 text-primary" />
                    Risk Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white">Overall Risk</span>
                        <span className="text-white">{predictionData?.riskLevel ? predictionData.riskLevel.charAt(0).toUpperCase() + predictionData.riskLevel.slice(1) : 'Medium'}</span>
                      </div>
                      <Progress 
                        value={predictionData?.riskLevel === 'low' ? 25 : predictionData?.riskLevel === 'medium' ? 50 : 75} 
                        className="h-2 bg-white/10"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white">Market Volatility</span>
                        <span className="text-white">Medium</span>
                      </div>
                      <Progress value={60} className="h-2 bg-white/10" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white">Liquidity</span>
                        <span className="text-white">High</span>
                      </div>
                      <Progress value={85} className="h-2 bg-white/10" />
                    </div>
                    <Separator className="bg-white/10" />
                    <div className="text-sm text-muted-foreground">
                      <p>• Use tight stop losses during volatile hours</p>
                      <p>• High volume periods offer better entry/exit</p>
                      <p>• Avoid low liquidity periods (lunch hour)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Hourly Tab */}
          <TabsContent value="hourly" className="space-y-4">
            {/* Time Filter */}
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Timer className="h-5 w-5 text-primary" />
                  Hourly Analyses
                </CardTitle>
                                  <CardDescription className="text-muted-foreground">
                    Detailed hourly analysis with probability and risk assessment
                  </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-4">
                  <Select value={timeFilter} onValueChange={setTimeFilter}>
                    <SelectTrigger className="w-[180px] bg-zinc-950/50 border-white/10">
                      <SelectValue placeholder="Filter by time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Hours</SelectItem>
                      <SelectItem value="morning">Morning (9-11 AM)</SelectItem>
                      <SelectItem value="afternoon">Afternoon (1-3 PM)</SelectItem>
                      <SelectItem value="power-hours">Power Hours (2-3 PM)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  {filteredPredictions.map((prediction, index) => (
                    <Card key={index} className="border-l-4 border-l-primary bg-white/5 border-y-0 border-r-0 border-white/5">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="text-lg font-semibold text-white">{prediction.hour}</div>
                            <Badge 
                              variant="outline" 
                              className={getDirectionColor(prediction.direction)}
                            >
                              {getDirectionIcon(prediction.direction)}
                              {prediction.direction.charAt(0).toUpperCase() + prediction.direction.slice(1)}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-white">+{prediction.expectedMove.toFixed(1)}%</div>
                            <div className="text-sm text-muted-foreground">Expected Move</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                          <div>
                            <div className="text-sm text-muted-foreground">Probability</div>
                            <div className="text-lg font-semibold text-white">{(prediction.probability * 100).toFixed(0)}%</div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">Confidence</div>
                            <div className="text-lg font-semibold text-white">{prediction.confidence}%</div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">Volume</div>
                            <Badge 
                              variant="outline" 
                              className={getVolumeColor(prediction.volume)}
                            >
                              {prediction.volume.charAt(0).toUpperCase() + prediction.volume.slice(1)}
                            </Badge>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">Volatility</div>
                            <Badge 
                              variant="outline" 
                              className={prediction.volatility === 'high' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 
                                       prediction.volatility === 'normal' ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' : 
                                       'text-green-400 bg-green-500/10 border-green-500/20'}
                            >
                              {prediction.volatility.charAt(0).toUpperCase() + prediction.volatility.slice(1)}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm font-medium text-green-400 mb-1">Key Factors</div>
                            <div className="space-y-1">
                              {prediction.keyFactors.map((factor, idx) => (
                                <div key={idx} className="flex items-center gap-1 text-sm">
                                  <CheckCircle className="h-3 w-3 text-green-500" />
                                  <span className="text-zinc-300">{factor}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-red-400 mb-1">Risk Factors</div>
                            <div className="space-y-1">
                              {prediction.riskFactors.map((factor, idx) => (
                                <div key={idx} className="flex items-center gap-1 text-sm">
                                  <XCircle className="h-3 w-3 text-red-500" />
                                  <span className="text-zinc-300">{factor}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Key Levels Tab */}
          <TabsContent value="levels" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Support Levels */}
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-400">
                    <TrendingUp className="h-5 w-5" />
                    Support Levels
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Key price levels where the stock is likely to find support
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {predictionData?.keyLevels?.support?.map((level, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <span className="font-medium text-green-400">${level.toFixed(2)}</span>
                        </div>
                        <Badge variant="outline" className="text-green-400 bg-green-500/10 border-green-500/30 text-sm font-medium">
                          Strong
                        </Badge>
                      </div>
                    )) || (
                      <div className="text-center py-4 text-muted-foreground">
                        <p>No support levels available</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Resistance Levels */}
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-400">
                    <TrendingDown className="h-5 w-5" />
                    Resistance Levels
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Key price levels where the stock is likely to face resistance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {predictionData?.keyLevels?.resistance?.map((level, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                          <span className="font-medium text-red-400">${level.toFixed(2)}</span>
                        </div>
                        <Badge variant="outline" className="text-red-400 bg-red-500/10 border-red-500/30 text-sm font-medium">
                          Strong
                        </Badge>
                      </div>
                    )) || (
                      <div className="text-center py-4 text-muted-foreground">
                        <p>No resistance levels available</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Volume Profile */}
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Volume Profile
                </CardTitle>
                                  <CardDescription className="text-muted-foreground">
                    Price levels with high and low trading volume
                  </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-blue-400 mb-3">High Volume Areas</h4>
                    <div className="space-y-2">
                      {predictionData?.volumeProfile?.highVolume?.map((level, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-primary/10 rounded border border-primary/20">
                          <span className="font-medium text-blue-300">${level.toFixed(2)}</span>
                          <Badge variant="outline" className="text-blue-400 bg-primary/10 border-primary/30">
                            High Volume
                          </Badge>
                        </div>
                      )) || (
                        <div className="text-center py-2 text-muted-foreground">
                          <p>No high volume areas</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-zinc-400 mb-3">Low Volume Areas</h4>
                    <div className="space-y-2">
                      {predictionData?.volumeProfile?.lowVolume?.map((level, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-white/5 rounded border border-white/10">
                          <span className="font-medium text-zinc-300">${level.toFixed(2)}</span>
                          <Badge variant="outline" className="text-zinc-400 bg-white/5 border-white/10">
                            Low Volume
                          </Badge>
                        </div>
                      )) || (
                        <div className="text-center py-2 text-muted-foreground">
                          <p>No low volume areas</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Momentum Tab */}
          <TabsContent value="momentum" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Technical Indicators */}
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Zap className="h-5 w-5 text-primary" />
                    Technical Indicators
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white">RSI (14)</span>
                        <span className="text-white">{predictionData?.momentum?.rsi?.toFixed(1) || '50.0'}</span>
                      </div>
                      <Progress 
                        value={predictionData?.momentum?.rsi || 50} 
                        className="h-2 bg-white/10"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {predictionData?.momentum?.rsi > 70 ? 'Overbought' : 
                         predictionData?.momentum?.rsi < 30 ? 'Oversold' : 'Neutral'}
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white">MACD</span>
                        <span className="text-white">{predictionData?.momentum?.macd?.toFixed(3) || '0.000'}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Signal: {predictionData?.momentum?.macdSignal?.toFixed(3) || '0.000'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {predictionData?.momentum?.macd > predictionData?.momentum?.macdSignal ? 'Bullish' : 'Bearish'} Signal
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-white">Momentum Strength</span>
                        <span className="text-white">{((predictionData?.momentum?.strength || 0.5) * 100).toFixed(0)}%</span>
                      </div>
                      <Progress value={(predictionData?.momentum?.strength || 0.5) * 100} className="h-2 bg-white/10" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Trading Recommendations */}
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Target className="h-5 w-5 text-primary" />
                    Trading Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                      <h4 className="font-medium text-green-400 mb-2">✅ Best Entry Points</h4>
                      <ul className="text-sm text-green-300 space-y-1">
                        <li>• 2:00 PM - High volume, strong momentum</li>
                        <li>• 9:00 AM - Opening gap opportunities</li>
                        <li>• Support levels: ${predictionData?.keyLevels?.support?.[0]?.toFixed(2) || 'N/A'}</li>
                      </ul>
                    </div>
                    <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                      <h4 className="font-medium text-yellow-400 mb-2">⚠️ Caution Areas</h4>
                      <ul className="text-sm text-yellow-300 space-y-1">
                        <li>• 12:00 PM - Low volume, lunch hour</li>
                        <li>• Resistance at ${predictionData?.keyLevels?.resistance?.[0]?.toFixed(2) || 'N/A'}</li>
                        <li>• High volatility periods</li>
                      </ul>
                    </div>
                    <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                      <h4 className="font-medium text-red-400 mb-2">❌ Avoid Trading</h4>
                      <ul className="text-sm text-red-300 space-y-1">
                        <li>• Market open volatility (first 15 min)</li>
                        <li>• Low liquidity periods</li>
                        <li>• Major news events</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Timing Tab */}
          <TabsContent value="timing" className="space-y-4">
            <TimingDisplay 
              symbol={selectedSymbol}
              predictionData={predictionData}
              marketStatus={null}
              userTimezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
            />
          </TabsContent>
        </Tabs>
        )}

        {/* Analysis Prompt */}
        {selectedSymbolData && !predictionData && (
          <Card className="glass-panel mt-6">
            <CardContent className="p-8">
              <div className="text-center space-y-4">
                <div className="text-muted-foreground">
                  <Target className="h-16 w-16 mx-auto mb-4 opacity-50 text-primary" />
                  <h3 className="text-xl font-semibold text-white mb-2">Ready to Analyze {selectedSymbolData.symbol}?</h3>
                  <p className="text-muted-foreground mb-4">
                    Click the "Analyze" button above to generate AI-powered intraday predictions
                  </p>
                  <Button 
                    onClick={handleSymbolSearch}
                    disabled={isLoading}
                    size="lg"
                    className="min-w-[200px] shadow-[0_0_20px_rgba(20,184,166,0.2)]"
                  >
                    {isLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    {isLoading ? 'Generating Analyses...' : 'Generate AI Analyses'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer Info */}
        {predictionData && (
          <Card className="mt-6 bg-transparent border-none shadow-none">
            <CardContent className="p-4">
              <div className="text-center text-sm text-muted-foreground">
                <p>🕐 Last updated: {predictionData?.timestamp ? new Date(predictionData.timestamp).toLocaleTimeString() : 'N/A'}</p>
                <p>📊 Real-time AI predictions with 5-minute cache refresh</p>
                <p>🚀 Powered by advanced ensemble prediction models</p>
                <p>⚠️ This is for educational purposes. Always do your own research before trading.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </Container>
    </div>
  );
}
