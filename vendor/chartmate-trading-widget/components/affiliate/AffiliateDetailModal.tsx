import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AffiliateDetailFullPage } from "./AffiliateDetailFullPage";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affiliateId: string | null;
  surface: "admin" | "wl";
  backLabel?: string;
};

export function AffiliateDetailModal({ open, onOpenChange, affiliateId, surface, backLabel }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          "!fixed !inset-0 !left-0 !top-0 z-[100] !translate-x-0 !translate-y-0 !max-w-none w-screen h-screen max-h-none rounded-none border-0 p-4 sm:p-6 overflow-y-auto overflow-x-hidden shadow-none gap-0",
          surface === "wl" ? "bg-black text-white" : "bg-zinc-950 text-zinc-100",
          "[&>button.absolute]:hidden",
        )}
      >
        <DialogTitle className="sr-only">Affiliate statistics and referrals</DialogTitle>
        {affiliateId ? (
          <AffiliateDetailFullPage
            affiliateId={affiliateId}
            onBack={() => onOpenChange(false)}
            backLabel={backLabel ?? "Back to affiliates"}
            surface={surface}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
