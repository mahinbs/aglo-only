import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface HorizonTileProps {
  horizon: string
  shortHorizon?: string
  direction: "up" | "down" | "sideways"
  expectedReturn: number
  confidence: number
  phase: 'waiting' | 'active' | 'expired'
  primaryLabel: string
  secondaryLabel?: string
}

export function HorizonTile({
  horizon,
  shortHorizon,
  direction,
  expectedReturn,
  confidence,
  phase,
  primaryLabel,
  secondaryLabel
}: HorizonTileProps) {
  const directionConfig = {
    up: {
      icon: TrendingUp,
      gradient: "from-trading-green/20 to-trading-green/5",
      border: "border-trading-green/30",
      glow: "shadow-lg shadow-trading-green/20",
      emoji: "↗️"
    },
    down: {
      icon: TrendingDown, 
      gradient: "from-trading-red/20 to-trading-red/5",
      border: "border-trading-red/30",
      glow: "shadow-lg shadow-trading-red/20",
      emoji: "↘️"
    },
    sideways: {
      icon: Minus,
      gradient: "from-primary/20 to-primary/5", 
      border: "border-primary/30",
      glow: "shadow-lg shadow-primary/20",
      emoji: "↔️"
    }
  }

  const config = directionConfig[direction]
  const Icon = config.icon

  return (
    <div className={cn(
      "relative group rounded-xl border p-4 transition-all duration-300 hover:scale-[1.02]",
      "bg-gradient-to-br backdrop-blur-sm",
      phase === 'expired' ? "from-muted/20 to-muted/5 border-muted/20" : config.gradient,
      phase === 'expired' ? "" : config.border,
      phase === 'expired' ? "" : config.glow
    )}>
      {/* Animated background gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative space-y-3">
        {/* Header with horizon and status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <div className={cn(
              "text-xs font-mono leading-tight break-words",
              phase === 'expired' ? "text-muted-foreground" : "text-foreground"
            )}>
              {horizon}
            </div>
            {shortHorizon && (
              <Badge 
                variant={phase === 'expired' ? "outline" : "secondary"}
                className="text-xs font-mono"
              >
                {shortHorizon}
              </Badge>
            )}
          </div>
          
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium",
            phase === 'expired' ? "text-muted-foreground" : "text-foreground"
          )}>
            <Icon className="h-3 w-3" />
            {config.emoji}
          </div>
        </div>

        {/* Analysis details */}
        <div className="space-y-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold">
              {expectedReturn >= 0 ? "+" : ""}{expectedReturn.toFixed(2)}%
            </span>
            <span className="text-xs text-muted-foreground">expected</span>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {confidence}% confidence
              </span>
            </div>
            <div className="text-right space-y-1">
              <div className={cn(
                "font-mono text-sm font-medium break-words",
                phase === 'expired' ? "text-trading-red" : 
                phase === 'waiting' ? "text-accent" : "text-primary"
              )}>
                {primaryLabel}
              </div>
              {secondaryLabel && (
                <div className="font-mono text-xs text-muted-foreground">
                  {secondaryLabel}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {phase === 'expired' ? "results ready" : 
                 phase === 'waiting' ? "total time" : "remaining"}
              </div>
            </div>
          </div>
        </div>

        {/* Progress indicator only for active phase */}
        {phase === 'active' && (
          <div className="w-full h-1 bg-muted/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full animate-pulse"
              style={{ width: `${Math.min(confidence, 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}