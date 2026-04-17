/**
 * Global bell: lists all `entry_point_alerts` (same data as "Past entry digests" in LiveEntryTrackingSection).
 * Use `EntryPointNotificationsHeaderButton` on Live Trading header; fixed bell hidden on that route.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  buildEntryDigestCsv,
  downloadTextFile,
  type EntryPointAlertRow,
} from "@/lib/entryPointAlertsCsv";

function shouldShowFixedBell(pathname: string): boolean {
  if (pathname === "/auth" || pathname.startsWith("/auth/") || pathname === "/register" || pathname === "/tick-chart") {
    return false;
  }
  if (pathname === "/predict" || pathname === "/intraday") return false;
  if (pathname === "/trading-dashboard") return false;
  return true;
}

function useEntryPointNotifications() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<EntryPointAlertRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setAlerts([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("entry_point_alerts")
        .select("id,symbol,title,message,created_at,read_at,metadata")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setAlerts((data as EntryPointAlertRow[]) ?? []);
    } catch (e) {
      console.error(e);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const unreadTotal = useMemo(() => alerts.filter((a) => !a.read_at).length, [alerts]);

  return {
    open,
    setOpen,
    alerts,
    loading,
    markingRead,
    setMarkingRead,
    exporting,
    setExporting,
    load,
    unreadTotal,
    toast,
  };
}

type PanelProps = {
  userId: string | undefined;
  state: ReturnType<typeof useEntryPointNotifications>;
};

function EntryPointNotificationsSheetPanel({ userId, state }: PanelProps) {
  const navigate = useNavigate();
  const {
    open,
    setOpen,
    alerts,
    loading,
    markingRead,
    setMarkingRead,
    exporting,
    setExporting,
    load,
    unreadTotal,
    toast,
  } = state;

  const markAllRead = async () => {
    if (!userId) return;
    setMarkingRead(true);
    try {
      const { error } = await (supabase as any)
        .from("entry_point_alerts")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) throw error;
      await load(userId);
      toast({ title: "Marked as read", description: "All entry digest notifications are marked read." });
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Could not update",
        variant: "destructive",
      });
    } finally {
      setMarkingRead(false);
    }
  };

  const markOneRead = async (id: string) => {
    if (!userId) return;
    try {
      const { error } = await (supabase as any)
        .from("entry_point_alerts")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
      await load(userId);
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Could not update",
        variant: "destructive",
      });
    }
  };

  const exportCsv = async () => {
    if (!userId) return;
    setExporting(true);
    try {
      const { data, error } = await (supabase as any)
        .from("entry_point_alerts")
        .select("id,symbol,title,message,created_at,read_at,metadata")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const rows = (data as EntryPointAlertRow[]) ?? [];
      if (rows.length === 0) {
        toast({ title: "Nothing to export", description: "No digest history yet." });
        return;
      }
      const csv = "\uFEFF" + buildEntryDigestCsv(rows);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadTextFile(`entry-digests-all-${stamp}.csv`, csv, "text/csv;charset=utf-8");
      toast({ title: "Download started", description: `${rows.length} row(s) in CSV.` });
    } catch (e: unknown) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto border-l border-border/80">
        <SheetHeader className="text-left space-y-1 pr-8">
          <SheetTitle className="text-lg">Entry point notifications</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Entry-point digests, scheduled scanner runs, and when a scheduled strategy / paper trade starts live monitoring.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 text-xs gap-1"
            disabled={loading || markingRead || alerts.length === 0 || unreadTotal === 0}
            onClick={() => void markAllRead()}
          >
            {markingRead ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Mark all read
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 border-teal-500/30 text-teal-600 dark:text-teal-300"
            disabled={exporting || loading}
            onClick={() => void exportCsv()}
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </Button>
        </div>

        {unreadTotal > 0 && (
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400/90">{unreadTotal} unread</p>
        )}

        <div className="mt-4 space-y-3 max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No notifications yet. Enable entry-point alarms in Live Trading, or you’ll see one when a scheduled strategy / paper trade begins monitoring.
            </p>
          ) : (
            alerts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  if (!a.read_at) void markOneRead(a.id);
                  const meta = (a.metadata ?? {}) as Record<string, unknown>;
                  const historyId = typeof meta.history_id === "string" ? meta.history_id : null;
                  const symbol = typeof a.symbol === "string" ? a.symbol : "";
                  if (historyId || symbol) {
                    const qp = new URLSearchParams();
                    if (symbol) qp.set("symbol", symbol);
                    if (historyId) qp.set("historyId", historyId);
                    setOpen(false);
                    navigate(`/ai-trading-analysis?${qp.toString()}`);
                  }
                }}
                className={cn(
                  "w-full text-left rounded-md border p-3 transition-colors",
                  "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !a.read_at ? "border-l-4 border-l-amber-500 bg-amber-500/5 border-border" : "border-border/60",
                )}
              >
                <p className="text-xs font-mono text-teal-600 dark:text-teal-400/90 mb-1">{a.symbol}</p>
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  {a.title}
                  {!a.read_at && (
                    <span className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">New</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{a.message}</p>
                <p className="text-[10px] text-muted-foreground/80 mt-2">
                  {new Date(a.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  {a.read_at && (
                    <span>
                      {" "}
                      · Read {new Date(a.read_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  )}
                </p>
              </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function useEntryPointNotificationsSync(userId: string | undefined, load: (uid: string | undefined) => void) {
  useEffect(() => {
    void load(userId);
  }, [userId, load]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`entry_point_alerts_bell_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entry_point_alerts",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void load(userId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);
}

/** Inline bell for Live Trading Dashboard header (top right next to status chips). */
export function EntryPointNotificationsHeaderButton({ className }: { className?: string }) {
  const { user } = useAuth();
  const state = useEntryPointNotifications();
  const { load } = state;

  const stableLoad = useCallback(
    (uid: string | undefined) => {
      void load(uid);
    },
    [load],
  );

  useEntryPointNotificationsSync(user?.id, stableLoad);

  if (!user) return null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Entry and strategy notifications"
            className={cn(
              "relative h-9 w-9 shrink-0 rounded-full border-zinc-700 bg-zinc-900/80 text-zinc-200 overflow-visible",
              "hover:border-teal-500/50 hover:text-teal-300 hover:bg-teal-500/10",
              className,
            )}
            onClick={() => {
              state.setOpen(true);
              void load(user.id);
            }}
          >
            <Bell className="h-[17px] w-[17px]" />
            {state.unreadTotal > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-0.5 rounded-full bg-teal-500 text-[9px] font-bold text-black flex items-center justify-center border border-black/30">
                {state.unreadTotal > 99 ? "99+" : state.unreadTotal}
              </span>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          Entry digests and scheduled monitoring alerts
        </TooltipContent>
      </Tooltip>

      <EntryPointNotificationsSheetPanel userId={user.id} state={state} />
    </>
  );
}

/** Fixed top-right bell for most app routes (hidden on /trading-dashboard — use header button there). */
export function EntryPointNotificationsBell() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const state = useEntryPointNotifications();
  const { load } = state;

  const stableLoad = useCallback(
    (uid: string | undefined) => {
      void load(uid);
    },
    [load],
  );

  useEntryPointNotificationsSync(user?.id, stableLoad);

  if (!user) return null;
  if (!shouldShowFixedBell(pathname)) return null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Entry and strategy notifications"
            className={cn(
              "fixed z-40 top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))]",
              "h-10 w-10 rounded-full border-border/80 bg-background/90 backdrop-blur-md shadow-md overflow-visible",
              "hover:border-teal-500/40 hover:text-teal-300",
            )}
            onClick={() => {
              state.setOpen(true);
              void load(user.id);
            }}
          >
            <Bell className="h-[18px] w-[18px]" />
            {state.unreadTotal > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-teal-500 text-[10px] font-bold text-black flex items-center justify-center border border-black/20">
                {state.unreadTotal > 99 ? "99+" : state.unreadTotal}
              </span>
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          Entry notifications — digests, scheduled scans, and scheduled strategy monitoring start. Opens history.
        </TooltipContent>
      </Tooltip>

      <EntryPointNotificationsSheetPanel userId={user.id} state={state} />
    </>
  );
}
