import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent } from "@/components/ui/card"
import { asNumber } from "@/lib/utils"
import { formatPercentage } from "@/lib/display-utils"
import { formatDateTime, getShortHorizonLabel } from "@/lib/time"
import { getEffectiveStart, getEffectiveTarget } from "@/lib/market-hours"
import { useIsMobile } from "@/hooks/use-mobile"

interface Forecast {
  horizon: string
  direction: "up" | "down" | "sideways"
  probabilities: { up: number; down: number; sideways: number }
  expected_return_bp: number
  confidence: number
  key_drivers?: string[]
  risk_flags?: string[]
}

interface ForecastTableProps {
  forecasts: Forecast[]
  predictedAt?: Date | null
  marketTimeZone?: string | null
  marketStatus?: any
}

export function ForecastTable({ forecasts, predictedAt, marketTimeZone, marketStatus }: ForecastTableProps) {
  const isMobile = useIsMobile()

  const getDirectionColor = (direction: string) => {
    switch (direction) {
      case 'up': return 'bg-green-500/10 text-green-600 border-green-500/20'
      case 'down': return 'bg-red-500/10 text-red-600 border-red-500/20'
      default: return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
    }
  }

  const getHorizonLabel = (horizon: string) => {
    const minutes = parseInt(horizon)
    if (minutes < 60) return `${minutes}m`
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`
    if (minutes < 10080) return `${Math.round(minutes / 1440)}d`
    return `${Math.round(minutes / 10080)}w`
  }

  return (
    <div className="w-full space-y-4">
      {/* Mobile card layout */}
      {isMobile ? (
        <div className="space-y-4">
        {forecasts.map((forecast, index) => (
          <Card key={index} className="w-full">
            <CardContent className="p-4 space-y-4">
              {/* Header with timeframe and direction */}
              <div className="flex items-center justify-between">
                <div className="font-mono font-medium">
                  {predictedAt ? (
                    <div className="space-y-1">
                      <div className="font-semibold text-sm leading-tight">
                        {formatDateTime(getEffectiveTarget(forecast.horizon, getEffectiveStart(predictedAt, marketStatus)), marketTimeZone)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {getShortHorizonLabel(forecast.horizon)}
                      </div>
                    </div>
                  ) : (
                    getHorizonLabel(forecast.horizon)
                  )}
                </div>
                <Badge className={getDirectionColor(forecast.direction)}>
                  {forecast.direction.toUpperCase()}
                </Badge>
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Expected Return</div>
                  <div className={`font-mono text-sm ${forecast.expected_return_bp > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercentage(asNumber(forecast.expected_return_bp) / 100, 2, true)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Confidence</div>
                  <div className="flex items-center gap-2">
                    <Progress value={asNumber(forecast.confidence)} className="flex-1 h-2" />
                    <span className="text-xs font-mono">{formatPercentage(asNumber(forecast.confidence), 1, false)}</span>
                  </div>
                </div>
              </div>

              {/* Probability distribution */}
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Probability Distribution</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-600 w-8">↑ Up</span>
                    <Progress value={asNumber(forecast.probabilities.up) * 100} className="flex-1 h-2" />
                    <span className="text-green-600 font-mono w-10">
                      {formatPercentage(asNumber(forecast.probabilities.up) * 100, 0, false)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-red-600 w-8">↓ Down</span>
                    <Progress value={asNumber(forecast.probabilities.down) * 100} className="flex-1 h-2" />
                    <span className="text-red-600 font-mono w-10">
                      {formatPercentage(asNumber(forecast.probabilities.down) * 100, 0, false)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-yellow-600 w-8">→ Side</span>
                    <Progress value={asNumber(forecast.probabilities.sideways) * 100} className="flex-1 h-2" />
                    <span className="text-yellow-600 font-mono w-10">
                      {formatPercentage(asNumber(forecast.probabilities.sideways) * 100, 0, false)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        </div>
      ) : (
        /* Desktop table layout */
        <div className="w-full border rounded-lg overflow-x-auto">
        <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold w-1/5">Timeframe</TableHead>
            <TableHead className="font-semibold w-1/6">Direction</TableHead>
            <TableHead className="font-semibold w-1/6">Expected Return</TableHead>
            <TableHead className="font-semibold w-1/6">Confidence</TableHead>
            <TableHead className="font-semibold w-1/3">Probability Distribution</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {forecasts.map((forecast, index) => (
            <TableRow key={index} className="hover:bg-muted/30">
              <TableCell className="min-w-[250px] max-w-[260px]">
                {predictedAt ? (
                  <div className="space-y-1">
                    <div className="font-semibold text-sm leading-tight break-normal">
                      {formatDateTime(getEffectiveTarget(forecast.horizon, getEffectiveStart(predictedAt, marketStatus)), marketTimeZone)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {getShortHorizonLabel(forecast.horizon)}
                    </div>
                  </div>
                ) : (
                  getHorizonLabel(forecast.horizon)
                )}
              </TableCell>
              <TableCell>
                <Badge className={getDirectionColor(forecast.direction)}>
                  {forecast.direction.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="font-mono">
                <span className={forecast.expected_return_bp > 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatPercentage(asNumber(forecast.expected_return_bp) / 100, 2, true)}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress value={asNumber(forecast.confidence)} className="w-16 h-2" />
                  <span className="text-sm font-mono">{formatPercentage(asNumber(forecast.confidence), 1, false)}</span>
                </div>
              </TableCell>
              <TableCell className="min-w-0">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1 text-xs min-w-0">
                    <span className="text-green-600 w-6 flex-shrink-0">↑</span>
                    <Progress value={asNumber(forecast.probabilities.up) * 100} className="flex-1 min-w-0 h-1" />
                    <span className="text-green-600 font-mono w-8 text-xs flex-shrink-0">
                      {formatPercentage(asNumber(forecast.probabilities.up) * 100, 0, false)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs min-w-0">
                    <span className="text-red-600 w-6 flex-shrink-0">↓</span>
                    <Progress value={asNumber(forecast.probabilities.down) * 100} className="flex-1 min-w-0 h-1" />
                    <span className="text-red-600 font-mono w-8 text-xs flex-shrink-0">
                      {formatPercentage(asNumber(forecast.probabilities.down) * 100, 0, false)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs min-w-0">
                    <span className="text-yellow-600 w-6 flex-shrink-0">→</span>
                    <Progress value={asNumber(forecast.probabilities.sideways) * 100} className="flex-1 min-w-0 h-1" />
                    <span className="text-yellow-600 font-mono w-8 text-xs flex-shrink-0">
                      {formatPercentage(asNumber(forecast.probabilities.sideways) * 100, 0, false)}
                    </span>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        </Table>
        </div>
      )}
    </div>
  )
}