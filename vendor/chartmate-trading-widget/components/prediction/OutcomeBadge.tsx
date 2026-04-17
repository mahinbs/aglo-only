import { Badge } from "@/components/ui/badge"
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react"

interface OutcomeBadgeProps {
  /** `pending` kept for backwards compatibility — same as in_progress */
  outcome?:
    | "accurate"
    | "partial"
    | "failed"
    | "pending"
    | "inconclusive"
    | "completed"
    | "in_progress"
    | "analyzing"
  size?: "sm" | "md" | "lg"
}

export function OutcomeBadge({ outcome = "in_progress", size = "md" }: OutcomeBadgeProps) {
  const getOutcomeConfig = () => {
    switch (outcome) {
      case "completed":
        return {
          icon: CheckCircle,
          text: "Completed",
          className: "bg-slate-500/15 text-slate-200 border-slate-500/35",
        }
      case "analyzing":
        return {
          icon: Clock,
          text: "Scoring…",
          className: "bg-teal-500/15 text-teal-200 border-teal-500/35",
        }
      case "in_progress":
      case "pending":
        return {
          icon: Clock,
          text: "In Progress",
          className: "bg-primary/10 text-blue-700 border-primary/30",
        }
      case 'accurate':
        return {
          icon: CheckCircle,
          text: 'Accurate',
          className: 'bg-green-500/10 text-green-700 border-green-500/30'
        }
      case 'partial':
        return {
          icon: AlertCircle,
          text: 'Partially Correct',
          className: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30'
        }
      case 'failed':
        return {
          icon: XCircle,
          text: 'Incorrect',
          className: 'bg-red-500/10 text-red-700 border-red-500/30'
        }
      case 'inconclusive':
        return {
          icon: AlertCircle,
          text: 'Inconclusive',
          className: 'bg-gray-500/10 text-gray-700 border-gray-500/30'
        }
      default:
        return {
          icon: Clock,
          text: 'In Progress',
          className: 'bg-purple-500/10 text-purple-500 border-purple-500/30'
        }
    }
  }

  const config = getOutcomeConfig()
  const Icon = config.icon
  
  const iconSize = size === 'lg' ? 'h-5 w-5' : size === 'md' ? 'h-4 w-4' : 'h-3 w-3'
  const textSize = size === 'lg' ? 'text-sm' : 'text-xs'

  return (
    <Badge className={`${config.className} flex items-center gap-1 ${textSize}`}>
      <Icon className={iconSize} />
      {config.text}
    </Badge>
  )
}