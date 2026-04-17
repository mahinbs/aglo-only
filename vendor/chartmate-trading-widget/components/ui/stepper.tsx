import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface StepperProps {
  steps: Array<{
    id: string
    title: string
    description?: string
  }>
  currentStep: string
  completedSteps: string[]
  className?: string
}

export function Stepper({ steps, currentStep, completedSteps, className }: StepperProps) {
  const currentIndex = steps.findIndex(step => step.id === currentStep)
  const isStepCompleted = (stepId: string) => completedSteps.includes(stepId)
  const isStepCurrent = (stepId: string) => stepId === currentStep
  const isStepUpcoming = (stepIndex: number) => stepIndex > currentIndex

  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (className?.includes('mobile-stepper') && scrollRef.current) {
      const container = scrollRef.current;
      const activeStep = container.querySelector('[data-current="true"]') as HTMLElement | null;
      if (activeStep) {
        // Compute offset so the active step is centred inside the stepper strip only
        // (avoids scrollIntoView which bubbles to page scroll containers)
        const targetLeft =
          activeStep.offsetLeft -
          (container.offsetWidth - activeStep.offsetWidth) / 2;
        container.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
      }
    }
  }, [currentStep, className])

  return (
    <div className={cn("w-full overflow-x-clip", className)}>
      <div 
        ref={scrollRef}
        className={cn(
          "flex items-start transition-all duration-300",
          className?.includes('mobile-stepper') 
            ? "overflow-x-auto snap-x snap-mandatory no-scrollbar pb-4 -mx-1 px-1 pr-4 touch-pan-x" 
            : "justify-between"
        )}
      >
        {steps.map((step, index) => {
          const isCompleted = isStepCompleted(step.id)
          const isCurrent = isStepCurrent(step.id)
          const isUpcoming = isStepUpcoming(index)

          return (
            <React.Fragment key={step.id}>
              <div 
                data-current={isCurrent}
                className={cn(
                  "flex flex-col items-center shrink-0 transition-opacity duration-300",
                  className?.includes('mobile-stepper') 
                    ? "snap-center w-[120px]" 
                    : "flex-1"
                )}
              >
                <div
                  className={cn(
                    "relative flex items-center justify-center rounded-full border-2 transition-all duration-300 shrink-0",
                    className?.includes('mobile-stepper') ? "w-8 h-8" : "w-10 h-10",
                    {
                      "bg-primary border-primary text-primary-foreground shadow-sm": isCompleted,
                      "bg-primary/5 border-primary text-primary ring-4 ring-primary/5":
                        isCurrent && !isCompleted,
                      "bg-muted border-muted-foreground/20 text-muted-foreground": isUpcoming,
                    }
                  )}
                >
                  {isCompleted ? (
                    <Check className={cn(className?.includes('mobile-stepper') ? "w-4 h-4" : "w-5 h-5")} />
                  ) : (
                    <span className={cn("font-medium", className?.includes('mobile-stepper') ? "text-xs" : "text-sm")}>
                      {index + 1}
                    </span>
                  )}
                  
                  {/* Subtle progress indicator dots for mobile between rings */}
                  {index < steps.length - 1 && className?.includes('mobile-stepper') && (
                    <div className="absolute top-1/2 -right-6 w-4 h-[2px] bg-muted-foreground/10 -translate-y-1/2" />
                  )}
                </div>
                
                <div className={cn(
                  "mt-3 px-1 text-center",
                  className?.includes('mobile-stepper') ? "w-full" : "max-w-[120px]"
                )}>
                  <p
                    className={cn(
                      "font-semibold leading-tight tracking-tight",
                      className?.includes('mobile-stepper') ? "text-[11px] line-clamp-2" : "text-sm",
                      {
                        "text-foreground": isCompleted || isCurrent,
                        "text-muted-foreground/60": isUpcoming,
                      }
                    )}
                  >
                    {step.title}
                  </p>
                  {step.description && !className?.includes('mobile-stepper') && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Connecting line for desktop */}
              {index < steps.length - 1 && !className?.includes('mobile-stepper') && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mt-5 mx-2 transition-colors duration-500",
                    {
                      "bg-primary": index < currentIndex,
                      "bg-muted": index >= currentIndex,
                    }
                  )}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}