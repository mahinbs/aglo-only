import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

interface AffiliateForm {
  code: string;
  name: string;
  email: string;
  commission_percent: number;
  is_active: boolean;
}

interface CreateAffiliateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  initialData: AffiliateForm;
  onSave: (data: AffiliateForm) => Promise<void>;
  saving: boolean;
}

export function CreateAffiliateDialog({
  open,
  onOpenChange,
  editingId,
  initialData,
  onSave,
  saving
}: CreateAffiliateDialogProps) {
  const [form, setForm] = useState<AffiliateForm>(initialData);

  useEffect(() => {
    if (open) setForm(initialData);
  }, [open, initialData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            {editingId ? "Edit affiliate" : "Add new affiliate"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 py-4">
          <div className="grid gap-2">
            <Label className="text-xs font-medium text-zinc-400 ml-1 uppercase tracking-wider">Code (URL reference)</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="e.g. partner2024"
              className="bg-white/5 border-white/10 h-10 focus:ring-cyan-500/50"
              disabled={!!editingId}
            />
            {!editingId && (
              <p className="text-[10px] text-zinc-500 ml-1">
                Link: {window.location.origin}/?ref={form.code || "CODE"}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label className="text-xs font-medium text-zinc-400 ml-1 uppercase tracking-wider">Full Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Affiliate's name"
              className="bg-white/5 border-white/10 h-10"
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs font-medium text-zinc-400 ml-1 uppercase tracking-wider">Email Address</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="affiliate@example.com"
              className="bg-white/5 border-white/10 h-10"
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs font-medium text-zinc-400 ml-1 uppercase tracking-wider">Commission Percentage (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={form.commission_percent}
              onChange={(e) => setForm((f) => ({ ...f, commission_percent: Number(e.target.value) || 0 }))}
              className="bg-white/5 border-white/10 h-10"
            />
          </div>
          {editingId && (
            <div className="flex items-center gap-3 bg-white/5 p-3 rounded-lg border border-white/10">
              <input
                type="checkbox"
                id="aff_is_active_dialog"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-white/20 accent-cyan-500 bg-transparent"
              />
              <Label htmlFor="aff_is_active_dialog" className="text-sm font-medium cursor-pointer">Currently active</Label>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="hover:bg-white/5 border-white/10">Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving} className="bg-cyan-600 hover:bg-cyan-500 text-white min-w-[100px] h-9">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {editingId ? "Update Affiliate" : "Create Affiliate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
