import * as React from "react"
import { cn } from "@/lib/utils"

interface GlowCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glowColor?: "primary" | "accent" | "trading-green" | "trading-red"
  intensity?: "low" | "medium" | "high"
}

export function GlowCard({ 
  className, 
  children, 
  glowColor = "primary",
  intensity = "medium",
  ...props 
}: GlowCardProps) {
  const glowClasses = {
    primary: {
      low: "shadow-lg shadow-primary/10 border-primary/20",
      medium: "shadow-xl shadow-primary/20 border-primary/30",
      high: "shadow-2xl shadow-primary/30 border-primary/40"
    },
    accent: {
      low: "shadow-lg shadow-accent/10 border-accent/20", 
      medium: "shadow-xl shadow-accent/20 border-accent/30",
      high: "shadow-2xl shadow-accent/30 border-accent/40"
    },
    "trading-green": {
      low: "shadow-lg shadow-trading-green/10 border-trading-green/20",
      medium: "shadow-xl shadow-trading-green/20 border-trading-green/30", 
      high: "shadow-2xl shadow-trading-green/30 border-trading-green/40"
    },
    "trading-red": {
      low: "shadow-lg shadow-trading-red/10 border-trading-red/20",
      medium: "shadow-xl shadow-trading-red/20 border-trading-red/30",
      high: "shadow-2xl shadow-trading-red/30 border-trading-red/40"
    }
  }

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-card/50 backdrop-blur-sm text-card-foreground transition-all duration-300 md:hover:scale-[1.005] hover:shadow-2xl",
        glowClasses[glowColor][intensity],
        "before:absolute before:inset-0 before:rounded-lg before:bg-gradient-to-br before:from-white/5 before:to-transparent before:pointer-events-none",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}