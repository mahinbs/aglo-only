import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown } from "lucide-react"
import { formatCurrency, formatPercentage } from "@/lib/display-utils"
import { asNumber } from "@/lib/utils"

interface SupportResistanceLevel {
  level: number
  strength: number
}

interface KeyLevelsProps {
  supportLevels?: SupportResistanceLevel[]
  resistanceLevels?: SupportResistanceLevel[]
  currentPrice: number
  /** When set, used for level prices (e.g. after INR↔USD conversion for display). */
  formatLevelPrice?: (level: number) => string
}

export function KeyLevels({ supportLevels = [], resistanceLevels = [], currentPrice, formatLevelPrice }: KeyLevelsProps) {
  const formatLevel = (level: number) =>
    formatLevelPrice
      ? formatLevelPrice(level)
      : formatCurrency(asNumber(level), 2)
  const getStrengthColor = (strength: number) => {
    const normalizedStrength = asNumber(strength)
    if (normalizedStrength >= 0.8) return "bg-green-500/20 text-green-700 border-green-500/30"
    if (normalizedStrength >= 0.6) return "bg-yellow-500/20 text-yellow-700 border-yellow-500/30"
    return "bg-red-500/20 text-red-700 border-red-500/30"
  }

  const getStrengthLabel = (strength: number) => {
    const normalizedStrength = asNumber(strength)
    if (normalizedStrength >= 0.8) return "Strong"
    if (normalizedStrength >= 0.6) return "Moderate"
    return "Weak"
  }

  const formatDistance = (level: number) => {
    const distance = ((level - currentPrice) / currentPrice) * 100
    return formatPercentage(distance, 1, true)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Support Levels */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingDown className="h-5 w-5 text-green-600" />
            Support Levels
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {supportLevels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No support levels identified</p>
          ) : (
            supportLevels
              .sort((a, b) => asNumber(b.level) - asNumber(a.level))
              .map((support, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-mono font-semibold">{formatLevel(asNumber(support.level))}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistance(asNumber(support.level))} from current
                    </p>
                  </div>
                  <Badge className={getStrengthColor(support.strength)}>
                    {getStrengthLabel(support.strength)}
                  </Badge>
                </div>
              ))
          )}
        </CardContent>
      </Card>

      {/* Resistance Levels */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-red-600" />
            Resistance Levels
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {resistanceLevels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No resistance levels identified</p>
          ) : (
            resistanceLevels
              .sort((a, b) => asNumber(a.level) - asNumber(b.level))
              .map((resistance, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-mono font-semibold">{formatLevel(asNumber(resistance.level))}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistance(asNumber(resistance.level))} from current
                    </p>
                  </div>
                  <Badge className={getStrengthColor(resistance.strength)}>
                    {getStrengthLabel(resistance.strength)}
                  </Badge>
                </div>
              ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}