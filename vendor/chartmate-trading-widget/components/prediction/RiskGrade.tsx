import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";

interface RiskGradeProps {
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export function RiskGrade({ level, size = 'md', showIcon = true }: RiskGradeProps) {
  const getRiskStyles = () => {
    switch (level) {
      case 'LOW':
        return {
          bg: 'bg-green-500/10',
          border: 'border-green-500',
          text: 'text-green-600',
          icon: Shield,
          label: '🟢 LOW RISK'
        };
      case 'MEDIUM':
        return {
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500',
          text: 'text-yellow-600',
          icon: AlertTriangle,
          label: '🟡 MEDIUM RISK'
        };
      case 'HIGH':
        return {
          bg: 'bg-orange-500/10',
          border: 'border-orange-500',
          text: 'text-orange-600',
          icon: AlertTriangle,
          label: '🟠 HIGH RISK'
        };
      case 'VERY_HIGH':
        return {
          bg: 'bg-red-500/10',
          border: 'border-red-500',
          text: 'text-red-600',
          icon: AlertOctagon,
          label: '🔴 VERY HIGH RISK'
        };
    }
  };

  const styles = getRiskStyles();
  const Icon = styles.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2'
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  return (
    <Badge 
      className={cn(
        styles.bg,
        styles.border,
        styles.text,
        'border font-semibold',
        sizeClasses[size]
      )}
    >
      {showIcon && <Icon className={cn(iconSizes[size], 'mr-1.5')} />}
      {styles.label}
    </Badge>
  );
}
