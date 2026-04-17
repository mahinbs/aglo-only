import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface StepContainerProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  isActive?: boolean
}

export function StepContainer({ 
  title, 
  description, 
  children, 
  className,
  isActive = true 
}: StepContainerProps) {
  return (
    <Card className={cn(
      "transition-all duration-300 border border-white/5",
      {
        "ring-1 ring-primary/50 shadow-[0_0_15px_rgba(20,184,166,0.1)] bg-zinc-900/40 backdrop-blur-sm": isActive,
        "opacity-60 grayscale hover:opacity-100 hover:grayscale-0": !isActive
      },
      className
    )}>
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">{title}</CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  )
}
