import { cn } from "@/lib/utils"

interface ContainerProps {
  children: React.ReactNode
  className?: string
}

export function Container({ children, className }: ContainerProps) {
  return (
    <div className={cn(
      "mx-auto w-full px-3 sm:px-6 lg:px-6",
      "max-w-[1200px] md:max-w-[1400px] xl:max-w-[1600px] 2xl:max-w-[1800px]",
      className
    )}>
      {children}
    </div>
  )
}