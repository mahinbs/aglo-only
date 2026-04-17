import { Badge } from "@/components/ui/badge";
import { ArrowUpCircle, ArrowDownCircle, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionSignalProps {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  size?: 'sm' | 'md' | 'lg';
}

export function ActionSignal({ action, confidence, size = 'md' }: ActionSignalProps) {
  const getActionStyles = () => {
    switch (action) {
      case 'BUY':
        return {
          bg: 'bg-green-500/10 hover:bg-green-500/20',
          border: 'border-green-500',
          text: 'text-green-600',
          icon: ArrowUpCircle
        };
      case 'SELL':
        return {
          bg: 'bg-red-500/10 hover:bg-red-500/20',
          border: 'border-red-500',
          text: 'text-red-600',
          icon: ArrowDownCircle
        };
      case 'HOLD':
        return {
          bg: 'bg-yellow-500/10 hover:bg-yellow-500/20',
          border: 'border-yellow-500',
          text: 'text-yellow-600',
          icon: MinusCircle
        };
    }
  };

  const styles = getActionStyles();
  const Icon = styles.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-lg px-4 py-2'
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  return (
    <div className="flex items-center gap-2">
      <Badge 
        className={cn(
          styles.bg,
          styles.border,
          styles.text,
          'border-2 font-bold',
          sizeClasses[size]
        )}
      >
        <Icon className={cn(iconSizes[size], 'mr-1')} />
        {action}
      </Badge>
      {confidence && (
        <Badge 
          variant="outline"
          className={cn(
            'border-primary/30 bg-primary/5',
            sizeClasses[size]
          )}
        >
          <span className="text-muted-foreground text-xs">ML Confidence:</span>
          <span className="ml-1 font-bold">{confidence}%</span>
        </Badge>
      )}
    </div>
  );
}
