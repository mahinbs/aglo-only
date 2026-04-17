import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Target, 
  TrendingUp, 
  Shield, 
  Clock, 
  DollarSign, 
  Briefcase,
  GraduationCap,
  AlertCircle,
  Zap,
  Activity,
  AlertTriangle
} from "lucide-react";

export interface UserProfile {
  riskTolerance: 'low' | 'medium' | 'high';
  tradingStyle: 'day_trading' | 'swing_trading' | 'position_trading' | 'long_term';
  investmentGoal: 'growth' | 'income' | 'speculation' | 'hedging';
  stopLossPercentage: number;
  targetProfitPercentage: number;
  // Trading execution
  leverage?: number; // 1x, 2x, 5x, 10x, etc.
  marginType?: 'cash' | 'margin' | 'options';
  userHoldingPeriod?: string; // User can override AI recommendation (e.g., "2 days", "1 week")
  // NEW: Trading Strategy
  tradingStrategy?: 'trend_following' | 'breakout_breakdown' | 'mean_reversion' | 'news_based' | 'momentum' | 'range_trading';
  // NEW: Entry Timing
  entryTiming?: 'immediate' | 'wait_confirmation';
  // NEW: Volatility Tolerance
  volatilityTolerance?: 'low' | 'medium' | 'high';
  // NEW: Risk Acceptance
  riskAcceptance?: boolean;
  // Optional advanced
  portfolioSize?: 'small' | 'medium' | 'large';
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
}

interface UserProfileFormProps {
  profile: Partial<UserProfile>;
  onChange: (profile: Partial<UserProfile>) => void;
  investmentAmount?: number; // For calculating max loss
  marketClosed?: boolean; // Whether market is currently closed
  marketOpenTime?: string; // When market opens
}

export const UserProfileForm = ({ 
  profile, 
  onChange, 
  investmentAmount = 0,
  marketClosed = false,
  marketOpenTime
}: UserProfileFormProps) => {
  const updateProfile = (key: keyof UserProfile, value: any) => {
    onChange({ ...profile, [key]: value });
  };

  // Calculate max acceptable loss
  const maxLoss = investmentAmount && profile.stopLossPercentage 
    ? (investmentAmount * profile.stopLossPercentage / 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Market Closed Warning */}
      {marketClosed && (
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-semibold text-yellow-600">📅 Market Currently Closed</p>
              <p className="text-sm">
                This market is currently closed. Some trading options may be limited:
              </p>
              <ul className="text-xs space-y-1 ml-4 list-disc">
                <li><strong>Immediate Entry</strong> will be disabled - you'll need to wait for market to open</li>
                <li><strong>Intraday</strong> holding period may not be suitable</li>
                <li>Prices shown are from the last trading session</li>
                {marketOpenTime && <li className="text-green-600 font-medium">Market opens: {marketOpenTime}</li>}
              </ul>
              <p className="text-xs mt-2">
                💡 <strong>Tip:</strong> Select "Wait for Confirmation" entry timing and longer holding periods for closed markets.
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {/* Risk Tolerance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            Risk Tolerance
          </CardTitle>
          <CardDescription>
            How much risk are you comfortable taking?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={profile.riskTolerance}
            onValueChange={(value) => updateProfile('riskTolerance', value)}
            className="space-y-3"
          >
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="low" id="risk-low" />
              <Label htmlFor="risk-low" className="flex-1 cursor-pointer">
                <div className="font-medium">Low Risk</div>
                <div className="text-sm text-muted-foreground">Conservative approach, capital preservation priority</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="medium" id="risk-medium" />
              <Label htmlFor="risk-medium" className="flex-1 cursor-pointer">
                <div className="font-medium">Medium Risk</div>
                <div className="text-sm text-muted-foreground">Balanced approach, moderate growth expectations</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="high" id="risk-high" />
              <Label htmlFor="risk-high" className="flex-1 cursor-pointer">
                <div className="font-medium">High Risk</div>
                <div className="text-sm text-muted-foreground">Aggressive approach, maximum growth potential</div>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Trading Style */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            Trading Style
          </CardTitle>
          <CardDescription>
            What's your preferred trading approach?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={profile.tradingStyle}
            onValueChange={(value) => updateProfile('tradingStyle', value)}
            className="space-y-3"
          >
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="day_trading" id="style-day" />
              <Label htmlFor="style-day" className="flex-1 cursor-pointer">
                <div className="font-medium">Day Trading</div>
                <div className="text-sm text-muted-foreground">Close positions within same day</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="swing_trading" id="style-swing" />
              <Label htmlFor="style-swing" className="flex-1 cursor-pointer">
                <div className="font-medium">Swing Trading</div>
                <div className="text-sm text-muted-foreground">Hold for days to weeks, capture short-term trends</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="position_trading" id="style-position" />
              <Label htmlFor="style-position" className="flex-1 cursor-pointer">
                <div className="font-medium">Position Trading</div>
                <div className="text-sm text-muted-foreground">Hold for weeks to months, follow major trends</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="long_term" id="style-long" />
              <Label htmlFor="style-long" className="flex-1 cursor-pointer">
                <div className="font-medium">Long-Term Investing</div>
                <div className="text-sm text-muted-foreground">Hold for months to years, buy and hold strategy</div>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* NEW: Trading Strategy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-primary" />
            Trading Strategy
          </CardTitle>
          <CardDescription>
            What strategy will you use for this trade?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={profile.tradingStrategy}
            onValueChange={(value) => updateProfile('tradingStrategy', value)}
            className="space-y-3"
          >
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="trend_following" id="strategy-trend" />
              <Label htmlFor="strategy-trend" className="flex-1 cursor-pointer">
                <div className="font-medium">Trend Following</div>
                <div className="text-sm text-muted-foreground">Trade in the direction of established trends</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="breakout_breakdown" id="strategy-breakout" />
              <Label htmlFor="strategy-breakout" className="flex-1 cursor-pointer">
                <div className="font-medium">Breakout / Breakdown</div>
                <div className="text-sm text-muted-foreground">Enter when price breaks key support/resistance</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="mean_reversion" id="strategy-mean" />
              <Label htmlFor="strategy-mean" className="flex-1 cursor-pointer">
                <div className="font-medium">Mean Reversion</div>
                <div className="text-sm text-muted-foreground">Buy oversold, sell overbought conditions</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="news_based" id="strategy-news" />
              <Label htmlFor="strategy-news" className="flex-1 cursor-pointer">
                <div className="font-medium">News-Based</div>
                <div className="text-sm text-muted-foreground">Trade based on fundamental news and events</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="momentum" id="strategy-momentum" />
              <Label htmlFor="strategy-momentum" className="flex-1 cursor-pointer">
                <div className="font-medium">Momentum</div>
                <div className="text-sm text-muted-foreground">Ride strong price movements and momentum</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="range_trading" id="strategy-range" />
              <Label htmlFor="strategy-range" className="flex-1 cursor-pointer">
                <div className="font-medium">Range Trading</div>
                <div className="text-sm text-muted-foreground">Buy at support, sell at resistance in sideways market</div>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Investment Goal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-primary" />
            Investment Goal
          </CardTitle>
          <CardDescription>
            What's your primary objective?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={profile.investmentGoal}
            onValueChange={(value) => updateProfile('investmentGoal', value)}
            className="space-y-3"
          >
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="growth" id="goal-growth" />
              <Label htmlFor="goal-growth" className="flex-1 cursor-pointer">
                <div className="font-medium">Capital Growth</div>
                <div className="text-sm text-muted-foreground">Long-term wealth accumulation</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="income" id="goal-income" />
              <Label htmlFor="goal-income" className="flex-1 cursor-pointer">
                <div className="font-medium">Income Generation</div>
                <div className="text-sm text-muted-foreground">Regular profits and cash flow</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="speculation" id="goal-speculation" />
              <Label htmlFor="goal-speculation" className="flex-1 cursor-pointer">
                <div className="font-medium">Speculation</div>
                <div className="text-sm text-muted-foreground">High-risk, high-reward opportunities</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="hedging" id="goal-hedging" />
              <Label htmlFor="goal-hedging" className="flex-1 cursor-pointer">
                <div className="font-medium">Hedging</div>
                <div className="text-sm text-muted-foreground">Portfolio protection and risk management</div>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Leverage & Margin */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            Leverage & Margin
          </CardTitle>
          <CardDescription>
            Are you using leverage or margin trading?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="margin-type">Account Type</Label>
            <RadioGroup
              value={profile.marginType || 'cash'}
              onValueChange={(value) => updateProfile('marginType', value)}
              className="grid sm:grid-cols-3 gap-3 mt-2"
            >
              <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
                <RadioGroupItem value="cash" id="margin-cash" />
                <Label htmlFor="margin-cash" className="cursor-pointer">Cash</Label>
              </div>
              <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
                <RadioGroupItem value="margin" id="margin-margin" />
                <Label htmlFor="margin-margin" className="cursor-pointer">Margin</Label>
              </div>
              <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
                <RadioGroupItem value="options" id="margin-options" />
                <Label htmlFor="margin-options" className="cursor-pointer">Options</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Show leverage ONLY for Margin accounts */}
          {profile.marginType === 'margin' && (
            <div>
              <Label htmlFor="leverage">Leverage Multiplier</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  id="leverage"
                  type="number"
                  min="1"
                  max="100"
                  step="0.5"
                  value={profile.leverage || 1}
                  onChange={(e) => updateProfile('leverage', parseFloat(e.target.value))}
                  placeholder="1"
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground">x</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Higher leverage = Higher risk and potential returns
              </p>
            </div>
          )}

          {/* Options have built-in leverage - show info instead */}
          {profile.marginType === 'options' && (
            <Alert className="border-primary/30 bg-primary/10">
              <AlertCircle className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                <span className="font-semibold">Options Trading:</span> Options contracts have built-in leverage
                (typically 10x-100x) based on the contract specifications. You don't set leverage manually.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* NEW: Entry Timing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-primary" />
            Entry Timing
          </CardTitle>
          <CardDescription>
            When do you want to enter the trade?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={profile.entryTiming || (marketClosed ? 'wait_confirmation' : 'immediate')}
            onValueChange={(value) => updateProfile('entryTiming', value)}
            className="space-y-3"
          >
            <div className={`flex space-x-2 border rounded-lg p-3 ${marketClosed ? 'opacity-50 cursor-not-allowed bg-muted' : 'hover:bg-accent cursor-pointer'}`}>
              <RadioGroupItem 
                value="immediate" 
                id="timing-immediate" 
                disabled={marketClosed}
              />
              <Label htmlFor="timing-immediate" className={`flex-1 ${marketClosed ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <div className="font-medium flex items-center gap-2">
                  Immediate Entry
                  {marketClosed && <Badge variant="destructive" className="text-xs">Market Closed</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {marketClosed 
                    ? 'Not available - market is currently closed' 
                    : 'Enter at current market price right now'
                  }
                </div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="wait_confirmation" id="timing-wait" />
              <Label htmlFor="timing-wait" className="flex-1 cursor-pointer">
                <div className="font-medium flex items-center gap-2">
                  Wait for Confirmation
                  {marketClosed && <Badge variant="secondary" className="text-xs">Recommended</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">Wait for price action confirmation before entering</div>
              </Label>
            </div>
          </RadioGroup>

          {marketClosed && (
            <Alert className="mt-4 border-primary/30 bg-primary/10">
              <AlertCircle className="h-4 w-4 text-primary" />
              <AlertDescription className="text-xs">
                Market is closed. "Immediate Entry" is disabled. Select "Wait for Confirmation" to enter when market opens.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* NEW: Volatility Tolerance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" />
            Volatility Tolerance
          </CardTitle>
          <CardDescription>
            How much price volatility can you handle?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={profile.volatilityTolerance || 'medium'}
            onValueChange={(value) => updateProfile('volatilityTolerance', value)}
            className="space-y-3"
          >
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="low" id="vol-low" />
              <Label htmlFor="vol-low" className="flex-1 cursor-pointer">
                <div className="font-medium">Low Volatility</div>
                <div className="text-sm text-muted-foreground">Prefer stable assets with minimal price swings</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="medium" id="vol-medium" />
              <Label htmlFor="vol-medium" className="flex-1 cursor-pointer">
                <div className="font-medium">Medium Volatility</div>
                <div className="text-sm text-muted-foreground">Comfortable with moderate price fluctuations</div>
              </Label>
            </div>
            <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
              <RadioGroupItem value="high" id="vol-high" />
              <Label htmlFor="vol-high" className="flex-1 cursor-pointer">
                <div className="font-medium">High Volatility</div>
                <div className="text-sm text-muted-foreground">Can handle large price swings for higher returns</div>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Risk Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="h-5 w-5 text-primary" />
            Risk Management
          </CardTitle>
          <CardDescription>
            Set your stop-loss and take-profit levels
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="stop-loss">Stop Loss Percentage</Label>
            <div className="flex items-center gap-2 mt-2">
              <Input
                id="stop-loss"
                type="number"
                min="1"
                max="50"
                step="0.5"
                value={profile.stopLossPercentage || ''}
                onChange={(e) => updateProfile('stopLossPercentage', parseFloat(e.target.value))}
                placeholder="e.g., 5"
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Maximum loss you're willing to accept</p>
          </div>
          <div>
            <Label htmlFor="target-profit">Target Profit Percentage</Label>
            <div className="flex items-center gap-2 mt-2">
              <Input
                id="target-profit"
                type="number"
                min="1"
                max="200"
                step="1"
                value={profile.targetProfitPercentage || ''}
                onChange={(e) => updateProfile('targetProfitPercentage', parseFloat(e.target.value))}
                placeholder="e.g., 15"
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Desired profit target for this trade</p>
          </div>

          {/* NEW: Max Acceptable Loss Display */}
          {investmentAmount > 0 && profile.stopLossPercentage && (
            <Alert className="border-red-500/30 bg-red-500/10">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <AlertDescription>
                <div className="space-y-1">
                  <div className="font-semibold text-red-600">
                    Max Acceptable Loss: ${maxLoss.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    If you invest ${investmentAmount.toFixed(2)} with {profile.stopLossPercentage}% stop loss, 
                    your maximum loss will be ${maxLoss.toFixed(2)}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Holding Period Override (Optional) */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-primary" />
            Holding Period (Optional)
          </CardTitle>
          <CardDescription>
            AI will recommend optimal holding period. You can override it here if you have a specific timeframe in mind.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <RadioGroup
              value={profile.userHoldingPeriod || 'ai_recommendation'}
              onValueChange={(value) => updateProfile('userHoldingPeriod', value === 'ai_recommendation' ? undefined : value)}
              className="space-y-3"
            >
              <div className="flex space-x-2 border rounded-lg p-3 bg-primary/5 hover:bg-accent cursor-pointer">
                <RadioGroupItem value="ai_recommendation" id="hold-ai" />
                <Label htmlFor="hold-ai" className="flex-1 cursor-pointer">
                  <div className="font-medium flex items-center gap-2">
                    AI Recommendation (Default)
                    <Badge variant="secondary" className="text-xs">Smart</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">Let AI decide optimal timeframe based on market analysis</div>
                </Label>
              </div>
              <div className={`flex space-x-2 border rounded-lg p-3 ${marketClosed ? 'opacity-50 bg-muted' : 'hover:bg-accent'} cursor-pointer`}>
                <RadioGroupItem value="intraday" id="hold-intraday" className="mt-1.5" />
                <Label htmlFor="hold-intraday" className="flex-1 cursor-pointer">
                  <div className="font-medium flex items-center gap-2">
                    Intraday (Hours)
                    {marketClosed && <Badge variant="destructive" className="text-xs">Not Recommended</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {marketClosed 
                      ? 'Market closed - may not be suitable' 
                      : 'Exit before market close today'
                    }
                  </div>
                </Label>
              </div>
              <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
                <RadioGroupItem value="1-2 days" id="hold-1-2d" />
                <Label htmlFor="hold-1-2d" className="flex-1 cursor-pointer">
                  <div className="font-medium">1-2 Days</div>
                  <div className="text-sm text-muted-foreground">Short-term swing trade</div>
                </Label>
              </div>
              <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
                <RadioGroupItem value="3-5 days" id="hold-3-5d" />
                <Label htmlFor="hold-3-5d" className="flex-1 cursor-pointer">
                  <div className="font-medium">3-5 Days</div>
                  <div className="text-sm text-muted-foreground">Swing trading timeframe</div>
                </Label>
              </div>
              <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
                <RadioGroupItem value="1 week" id="hold-1w" />
                <Label htmlFor="hold-1w" className="flex-1 cursor-pointer">
                  <div className="font-medium">1 Week</div>
                  <div className="text-sm text-muted-foreground">Medium-term position</div>
                </Label>
              </div>
              <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
                <RadioGroupItem value="2-4 weeks" id="hold-2-4w" />
                <Label htmlFor="hold-2-4w" className="flex-1 cursor-pointer">
                  <div className="font-medium">2-4 Weeks</div>
                  <div className="text-sm text-muted-foreground">Position trading</div>
                </Label>
              </div>
              <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
                <RadioGroupItem value="1+ months" id="hold-1m" />
                <Label htmlFor="hold-1m" className="flex-1 cursor-pointer">
                  <div className="font-medium">1+ Months</div>
                  <div className="text-sm text-muted-foreground">Long-term hold</div>
                </Label>
              </div>
              <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
                <RadioGroupItem value="none" id="hold-none" />
                <Label htmlFor="hold-none" className="flex-1 cursor-pointer">
                  <div className="font-medium">No Holding Period</div>
                  <div className="text-sm text-muted-foreground">Track indefinitely until target/stop loss hit</div>
                </Label>
              </div>
              <div className="flex space-x-2 border rounded-lg p-3 hover:bg-accent cursor-pointer">
                <RadioGroupItem value="custom" id="hold-custom" />
                <Label htmlFor="hold-custom" className="flex-1 cursor-pointer">
                  <div className="font-medium">Custom Period</div>
                  <div className="text-sm text-muted-foreground">Enter your own specific timeframe</div>
                </Label>
              </div>
            </RadioGroup>

            {/* Custom Holding Period Input */}
            {profile.userHoldingPeriod === 'custom' && (
              <div className="mt-4">
                <Label htmlFor="custom-period">Enter Custom Holding Period</Label>
                <Input
                  id="custom-period"
                  type="text"
                  placeholder="e.g., 6 hours, 3 days, 10 weeks"
                  className="mt-2"
                  onChange={(e) => updateProfile('userHoldingPeriod', e.target.value || 'custom')}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Examples: "6 hours", "3 days", "2 weeks", "45 days"
                </p>
              </div>
            )}

            {profile.userHoldingPeriod && profile.userHoldingPeriod !== 'ai_recommendation' && (
              <Alert className="border-primary/30 bg-primary/10">
                <AlertCircle className="h-4 w-4 text-primary" />
                <AlertDescription className="text-sm">
                  You've set a specific holding period. AI will still provide its recommendation, 
                  but your chosen timeframe of <strong>{profile.userHoldingPeriod}</strong> will be used for tracking.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Risk Acceptance Disclaimer — temporarily disabled (Continue no longer gated on checkbox)
      <Card id="risk-acknowledge-block" className="border-red-500/30 bg-red-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-red-600">
            <FileCheck className="h-5 w-5" />
            Risk Disclosure & Acceptance
          </CardTitle>
          <CardDescription>
            Please acknowledge the risks involved in trading
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-red-500/50 bg-red-500/10">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-sm">
              <div className="space-y-2">
                <p className="font-semibold text-red-600">⚠️ Trading Risks:</p>
                <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                  <li>You can lose part or all of your invested capital</li>
                  <li>Past performance does not guarantee future results</li>
                  <li>AI probability-based analyses are not 100% accurate and can be wrong</li>
                  <li>Market conditions can change rapidly and unexpectedly</li>
                  <li>Leverage amplifies both gains and losses</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>

          <div className="flex items-start space-x-3 border-2 border-red-500/30 rounded-lg p-4 bg-background">
            <Checkbox
              id="risk-acceptance"
              checked={profile.riskAcceptance || false}
              onCheckedChange={(checked) => updateProfile('riskAcceptance', checked)}
              className="mt-1"
            />
            <Label htmlFor="risk-acceptance" className="cursor-pointer text-sm leading-relaxed">
              <span className="font-semibold">I accept full responsibility for this risk.</span>
              <br />
              <span className="text-xs text-muted-foreground">
                I understand that trading involves substantial risk of loss and that I am solely responsible 
                for all trading decisions. I acknowledge that this AI tool provides analysis and suggestions, 
                but does not guarantee profits or prevent losses.
              </span>
            </Label>
          </div>

          {!profile.riskAcceptance && (
            <Alert className="border-yellow-500/30 bg-yellow-500/10">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-xs text-yellow-600">
                You must accept the risk disclosure to proceed with the analysis and trade tracking.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      */}

    </div>
  );
};
