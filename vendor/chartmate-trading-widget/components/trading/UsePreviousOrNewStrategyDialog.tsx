import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, Sparkles } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lastStrategyLabel: string;
  symbol: string;
  action: string;
  onUsePrevious: () => void;
  onChooseNew: () => void;
}

export function UsePreviousOrNewStrategyDialog({
  open, onOpenChange, lastStrategyLabel, symbol, action, onUsePrevious, onChooseNew,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle>Strategy for this {action}</DialogTitle>
            <Badge variant={action === "SELL" ? "destructive" : "default"} className="text-xs">
              {action} {symbol}
            </Badge>
          </div>
          <DialogDescription>
            Each strategy has its own stop loss, take profit & hold period. Choose to reuse your last strategy or pick a new one with AI analysis.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Button
            className="w-full justify-start gap-3 h-12"
            variant="outline"
            onClick={() => {
              onUsePrevious();
              onOpenChange(false);
            }}
          >
            <History className="h-5 w-5 shrink-0" />
            <span>Reuse: <strong>{lastStrategyLabel}</strong></span>
          </Button>
          <Button
            className="w-full justify-start gap-3 h-12"
            onClick={() => {
              onChooseNew();
              onOpenChange(false);
            }}
          >
            <Sparkles className="h-5 w-5 shrink-0" />
            <span>New strategy (AI + backtest)</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
