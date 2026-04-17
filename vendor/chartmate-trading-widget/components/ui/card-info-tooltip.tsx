import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Small “i” control for card headers; hover shows what the metric means. App root must wrap TooltipProvider (see App.tsx). */
export function CardInfoTooltip({
  text,
  className,
  side = "left",
}: {
  text: string;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 rounded-full p-1 text-zinc-500 hover:text-primary hover:bg-white/5 transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            className
          )}
          aria-label="What does this section mean?"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className="max-w-[min(320px,85vw)] text-xs leading-relaxed text-popover-foreground"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
