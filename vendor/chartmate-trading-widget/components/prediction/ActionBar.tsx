import { Button } from "@/components/ui/button"
import { Trash2, BarChart3, RefreshCw } from "lucide-react"

interface ActionBarProps {
  onDelete: () => void
  onAnalyze?: () => void
  onRefresh?: () => void
  isAnalyzing?: boolean
  showAnalyze?: boolean
  showRefresh?: boolean
}

export function ActionBar({ 
  onDelete, 
  onAnalyze, 
  onRefresh,
  isAnalyzing = false,
  showAnalyze = false,
  showRefresh = false
}: ActionBarProps) {
  return (
    <div className="flex items-center gap-2">
      {showRefresh && onRefresh && (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onRefresh()
          }}
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      )}
      
      {showAnalyze && onAnalyze && (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onAnalyze()
          }}
          disabled={isAnalyzing}
          className="flex items-center gap-2"
        >
          {isAnalyzing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <BarChart3 className="h-4 w-4" />
          )}
          {isAnalyzing ? 'Analyzing...' : 'Analyze Outcome'}
        </Button>
      )}
      
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}