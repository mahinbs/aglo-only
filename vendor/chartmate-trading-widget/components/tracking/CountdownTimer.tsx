import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface CountdownTimerProps {
  targetTime: string; // ISO string
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number; // milliseconds
  percentage: number; // 0-100, how much time has elapsed
}

export function CountdownTimer({ 
  targetTime, 
  label = "Time Remaining",
  size = 'md',
  showIcon = true 
}: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null);

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = new Date().getTime();
      const target = new Date(targetTime).getTime();
      const total = target - now;

      if (total <= 0) {
        setTimeRemaining({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          total: 0,
          percentage: 100
        });
        return;
      }

      const days = Math.floor(total / (1000 * 60 * 60 * 24));
      const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((total % (1000 * 60)) / 1000);

      // Calculate percentage (assuming max 30 days for calculation)
      const maxDuration = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
      const elapsed = maxDuration - total;
      const percentage = Math.min((elapsed / maxDuration) * 100, 100);

      setTimeRemaining({
        days,
        hours,
        minutes,
        seconds,
        total,
        percentage
      });
    };

    // Calculate immediately
    calculateTimeRemaining();

    // Update every second
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [targetTime]);

  if (!timeRemaining) {
    return null;
  }

  const getStatusColor = () => {
    if (timeRemaining.total === 0) return 'text-red-600';
    if (timeRemaining.percentage > 90) return 'text-red-500';
    if (timeRemaining.percentage > 75) return 'text-orange-500';
    if (timeRemaining.percentage > 50) return 'text-yellow-500';
    return 'text-green-600';
  };

  const getProgressColor = () => {
    if (timeRemaining.total === 0) return 'bg-red-600';
    if (timeRemaining.percentage > 90) return 'bg-red-500';
    if (timeRemaining.percentage > 75) return 'bg-orange-500';
    if (timeRemaining.percentage > 50) return 'bg-yellow-500';
    return 'bg-green-600';
  };

  const formatTime = () => {
    if (timeRemaining.total === 0) {
      return "Expired";
    }

    if (timeRemaining.days > 0) {
      return `${timeRemaining.days}d ${timeRemaining.hours}h ${timeRemaining.minutes}m`;
    }
    
    if (timeRemaining.hours > 0) {
      return `${timeRemaining.hours}h ${timeRemaining.minutes}m ${timeRemaining.seconds}s`;
    }
    
    return `${timeRemaining.minutes}m ${timeRemaining.seconds}s`;
  };

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  return (
    <div className="space-y-2">
      <div className={cn("flex items-center gap-2", sizeClasses[size])}>
        {showIcon && <Clock className={cn(iconSizes[size], getStatusColor())} />}
        <span className="text-muted-foreground">{label}:</span>
        <span className={cn("font-bold", getStatusColor())}>
          {formatTime()}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-1000 ease-linear",
            getProgressColor()
          )}
          style={{ width: `${100 - timeRemaining.percentage}%` }}
        />
      </div>

      {/* Status Text */}
      {timeRemaining.total === 0 && (
        <p className="text-xs text-red-600 font-medium">
          ⚠️ Holding period has ended
        </p>
      )}
      {timeRemaining.percentage > 90 && timeRemaining.total > 0 && (
        <p className="text-xs text-orange-600 font-medium">
          🔔 Exit zone - Consider closing position soon
        </p>
      )}
      {timeRemaining.percentage > 75 && timeRemaining.percentage <= 90 && (
        <p className="text-xs text-yellow-600 font-medium">
          ⏰ Approaching exit time
        </p>
      )}
    </div>
  );
}
