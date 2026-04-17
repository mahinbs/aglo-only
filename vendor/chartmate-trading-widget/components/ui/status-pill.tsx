import * as React from "react"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface StatusPillProps extends React.HTMLAttributes<HTMLDivElement> {
  status: "pending" | "running" | "completed" | "error"
  icon?: LucideIcon
  label?: string
  size?: "sm" | "md" | "lg"
}

export function StatusPill({ 
  status, 
  icon: Icon, 
  label,
  size = "md",
  className,
  ...props 
}: StatusPillProps) {
  const statusConfig = {
    pending: {
      gradient: "from-muted/50 to-muted/30",
      border: "border-muted/30",
      text: "text-muted-foreground",
      glow: ""
    },
    running: {
      gradient: "from-primary/20 to-primary/10", 
      border: "border-primary/30",
      text: "text-primary-foreground",
      glow: "shadow-lg shadow-primary/20"
    },
    completed: {
      gradient: "from-trading-green/20 to-trading-green/10",
      border: "border-trading-green/30", 
      text: "text-accent-foreground",
      glow: "shadow-lg shadow-trading-green/20"
    },
    error: {
      gradient: "from-trading-red/20 to-trading-red/10",
      border: "border-trading-red/30",
      text: "text-destructive-foreground", 
      glow: "shadow-lg shadow-trading-red/20"
    }
  }

  const sizeConfig = {
    sm: {
      padding: "px-2 py-1",
      text: "text-xs",
      icon: "h-3 w-3"
    },
    md: {
      padding: "px-3 py-1.5", 
      text: "text-sm",
      icon: "h-4 w-4"
    },
    lg: {
      padding: "px-4 py-2",
      text: "text-base",
      icon: "h-5 w-5"
    }
  }

  const config = statusConfig[status]
  const sizing = sizeConfig[size]

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border font-medium transition-all duration-200",
        "bg-gradient-to-r backdrop-blur-sm",
        config.gradient,
        config.border,
        config.text,
        config.glow,
        sizing.padding,
        sizing.text,
        className
      )}
      {...props}
    >
      {Icon && <Icon className={cn(sizing.icon, status === "running" && "animate-spin")} />}
      {label && <span>{label}</span>}
    </div>
  )
}