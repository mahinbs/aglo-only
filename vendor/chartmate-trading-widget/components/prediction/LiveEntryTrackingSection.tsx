/**
 * Entry-point digest "alarm": up to 5 symbols, per-symbol time + timezone + schedule
 * (all days, weekdays, custom weekdays, or tomorrow once). Past results = entry_point_alerts history.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Bell,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  History,
  Loader2,
  Trash2,
  CheckCheck,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { getAllTimeZoneIdentifiers, normalizeTimezoneId } from "@/lib/timezones";
import {
  buildEntryDigestCsv,
  downloadTextFile,
  type EntryPointAlertRow,
} from "@/lib/entryPointAlertsCsv";

const MAX_TRACKED = 5;

export type ScheduleMode = "all_days" | "weekdays" | "custom" | "tomorrow_once";

export type LiveEntryTrackerRow = {
  id: string;
  symbol: string;
  display_name: string | null;
  notify_time: string;
  timezone: string;
  enabled: boolean;
  schedule_mode: ScheduleMode;
  days_of_week: number[];
  one_off_local_date: string | null;
  selected_strategies?: string[];
  selected_custom_strategy_ids?: string[];
};

type PastAlert = EntryPointAlertRow;

type Props = {
  symbol: string;
  selectedBuiltInStrategies?: string[];
  selectedCustomStrategyIds?: string[];
};

function timeInputValueFromDb(t: string | undefined): string {
  if (!t) return "09:30";
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return "09:30";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function dbTimeFromInput(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return "09:30:00";
  return `${m[1].padStart(2, "0")}:${m[2]}:00`;
}

/** YYYY-MM-DD for an instant in `tz` */
function formatDateKeyInTz(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const mo = parts.find((p) => p.type === "month")?.value ?? "01";
  const da = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${mo}-${da}`;
}

function getTomorrowDateKeyInTz(tz: string): string {
  const now = new Date();
  const today = formatDateKeyInTz(now, tz);
  let t = now.getTime();
  for (let step = 0; step < 72; step++) {
    t += 3600000;
    const k = formatDateKeyInTz(new Date(t), tz);
    if (k !== today) return k;
  }
  return formatDateKeyInTz(new Date(now.getTime() + 36 * 3600000), tz);
}

const DAY_LABELS: { bit: number; label: string }[] = [
  { bit: 0, label: "Sun" },
  { bit: 1, label: "Mon" },
  { bit: 2, label: "Tue" },
  { bit: 3, label: "Wed" },
  { bit: 4, label: "Thu" },
  { bit: 5, label: "Fri" },
  { bit: 6, label: "Sat" },
];

export function LiveEntryTrackingSection({
  symbol,
  selectedBuiltInStrategies = [],
  selectedCustomStrategyIds = [],
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<LiveEntryTrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [pastAlerts, setPastAlerts] = useState<PastAlert[]>([]);
  const [pastLoading, setPastLoading] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tzPickerOpen, setTzPickerOpen] = useState(false);

  const normalized = useMemo(() => symbol.trim().toUpperCase(), [symbol]);
  const browserTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const allTimeZones = useMemo(() => getAllTimeZoneIdentifiers(), []);

  const load = useCallback(async () => {
    if (!user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("live_entry_trackers")
        .select(
          "id,symbol,display_name,notify_time,timezone,enabled,schedule_mode,days_of_week,one_off_local_date,selected_strategies,selected_custom_strategy_ids",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      const list = ((data ?? []) as LiveEntryTrackerRow[]).map((r) => ({
        ...r,
        timezone: normalizeTimezoneId(r.timezone),
      }));
      setRows(list);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadPast = useCallback(async () => {
    if (!user?.id || !normalized) return;
    setPastLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("entry_point_alerts")
        .select("id,symbol,title,message,created_at,read_at,metadata")
        .eq("user_id", user.id)
        .eq("symbol", normalized)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setPastAlerts((data as PastAlert[]) ?? []);
    } catch {
      setPastAlerts([]);
    } finally {
      setPastLoading(false);
    }
  }, [user?.id, normalized]);

  useEffect(() => {
    if (pastOpen) loadPast();
  }, [pastOpen, loadPast]);

  const unreadCount = useMemo(
    () => pastAlerts.filter((a) => !a.read_at).length,
    [pastAlerts],
  );

  const markAllReadForSymbol = async () => {
    if (!user?.id || !normalized) return;
    setMarkingRead(true);
    try {
      const { error } = await (supabase as any)
        .from("entry_point_alerts")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("symbol", normalized)
        .is("read_at", null);
      if (error) throw error;
      await loadPast();
      toast({ title: "Marked as read", description: `All digests for ${normalized} are marked read.` });
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

  const markAllReadEverywhere = async () => {
    if (!user?.id) return;
    setMarkingRead(true);
    try {
      const { error } = await (supabase as any)
        .from("entry_point_alerts")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null);
      if (error) throw error;
      await loadPast();
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

  const fetchAlertsForExport = async (scope: "symbol" | "all"): Promise<PastAlert[]> => {
    if (!user?.id) return [];
    let q = (supabase as any)
      .from("entry_point_alerts")
      .select("id,symbol,title,message,created_at,read_at,metadata")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (scope === "symbol") q = q.eq("symbol", normalized);
    const { data, error } = await q;
    if (error) throw error;
    return (data as PastAlert[]) ?? [];
  };

  const exportCsv = async (scope: "symbol" | "all") => {
    if (!user?.id) return;
    if (scope === "symbol" && !normalized) return;
    setExporting(true);
    try {
      const rows = await fetchAlertsForExport(scope);
      if (rows.length === 0) {
        toast({ title: "Nothing to export", description: "No digest history yet." });
        return;
      }
      const csv = "\uFEFF" + buildEntryDigestCsv(rows);
      const stamp = new Date().toISOString().slice(0, 10);
      const name =
        scope === "symbol"
          ? `entry-digests-${normalized}-${stamp}.csv`
          : `entry-digests-all-${stamp}.csv`;
      downloadTextFile(name, csv, "text/csv;charset=utf-8");
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

  const enabledCount = useMemo(() => rows.filter((r) => r.enabled).length, [rows]);
  const currentRow = useMemo(
    () => rows.find((r) => r.symbol.toUpperCase() === normalized),
    [rows, normalized],
  );
  const trackingThis = !!currentRow?.enabled;

  const timeZonesForPicker = useMemo(() => {
    const tz = currentRow?.timezone ? normalizeTimezoneId(currentRow.timezone) : browserTz;
    const set = new Set(allTimeZones);
    if (tz && !set.has(tz)) {
      return [tz, ...allTimeZones];
    }
    return allTimeZones;
  }, [allTimeZones, browserTz, currentRow?.timezone]);

  const updateTracker = async (
    id: string,
    patch: Partial<{
      notify_time: string;
      timezone: string;
      enabled: boolean;
      schedule_mode: ScheduleMode;
      days_of_week: number[];
      one_off_local_date: string | null;
    }>,
  ) => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("live_entry_trackers").update(patch).eq("id", id);
      if (error) throw error;
      await load();
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Update failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleCurrent = async (on: boolean) => {
    if (!user) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }
    if (!normalized) return;

    if (on) {
      const wouldExceed = enabledCount >= MAX_TRACKED && (!currentRow || !currentRow.enabled);
      if (wouldExceed) {
        toast({
          title: "Limit reached",
          description: `At most ${MAX_TRACKED} symbols with alerts on. Turn one off first.`,
          variant: "destructive",
        });
        return;
      }
      const mode = currentRow?.schedule_mode ?? "all_days";
      if (mode === "custom" && (currentRow?.days_of_week?.length ?? 0) === 0 && currentRow) {
        toast({
          title: "Pick days",
          description: "Select at least one day of the week for a custom schedule.",
          variant: "destructive",
        });
        return;
      }
    }

    if (currentRow) {
      setSaving(true);
      try {
        const { error } = await (supabase as any)
          .from("live_entry_trackers")
          .update({
            enabled: on,
            // Allow a digest to run again today after re-enable (otherwise last_digest_on blocks).
            ...(on ? { last_digest_on: null } : {}),
          })
          .eq("id", currentRow.id);
        if (error) throw error;
        await load();
        toast({
          title: on ? "Alerts on" : "Alerts off",
          description: on
            ? `Scheduled in ${currentRow.timezone}. Adjust time and repeat below.`
            : `Stopped alerts for ${normalized}.`,
        });
      } catch (e: unknown) {
        toast({
          title: "Error",
          description: e instanceof Error ? e.message : "Update failed",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    } else if (on) {
      const tz = normalizeTimezoneId(browserTz);
      const notify_time = "09:30:00";
      setSaving(true);
      try {
        const { error } = await (supabase as any).from("live_entry_trackers").insert({
          user_id: user.id,
          symbol: normalized,
          display_name: normalized,
          notify_time,
          timezone: tz,
          enabled: true,
          schedule_mode: "all_days",
          days_of_week: [],
          one_off_local_date: null,
          selected_strategies: selectedBuiltInStrategies.length > 0
            ? selectedBuiltInStrategies
            : ["trend_following", "mean_reversion", "momentum"],
          selected_custom_strategy_ids: selectedCustomStrategyIds,
        });
        if (error) throw error;
        await load();
        toast({
          title: "Alerts on",
          description: `Default: every day at 09:30 (${tz}). Adjust time and schedule below.`,
        });
      } catch (e: unknown) {
        toast({
          title: "Error",
          description: e instanceof Error ? e.message : "Could not enable",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    }
  };

  const updateRowTime = (id: string, notifyTimeInput: string, tz: string) => {
    void updateTracker(id, {
      notify_time: dbTimeFromInput(notifyTimeInput),
      timezone: normalizeTimezoneId(tz),
    });
  };

  const setScheduleMode = (id: string, mode: ScheduleMode, tz: string) => {
    const patch: Parameters<typeof updateTracker>[1] = { schedule_mode: mode };
    if (mode === "tomorrow_once") {
      patch.one_off_local_date = getTomorrowDateKeyInTz(tz);
    } else {
      patch.one_off_local_date = null;
    }
    if (mode !== "custom") {
      patch.days_of_week = [];
    }
    void updateTracker(id, patch);
  };

  const toggleDay = (id: string, bit: number, selected: number[]) => {
    const set = new Set(selected);
    if (set.has(bit)) set.delete(bit);
    else set.add(bit);
    void updateTracker(id, { days_of_week: Array.from(set).sort((a, b) => a - b) });
  };

  const removeRow = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("live_entry_trackers").delete().eq("id", id);
      if (error) throw error;
      await load();
      toast({ title: "Removed" });
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Delete failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-zinc-500">
        Sign in to set entry-point alarms for this symbol (up to {MAX_TRACKED} symbols total).
      </div>
    );
  }

  if (!normalized) return null;

  return (
    <div className="rounded-lg border border-teal-500/25 bg-teal-500/5 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Bell className="h-4 w-4 text-teal-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-white">Entry point alarms</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Daily digest for <span className="font-mono text-teal-200/90">{normalized}</span>. Up to {MAX_TRACKED} symbols total.
              Past digests below.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin text-teal-400" /> : null}
          <Switch
            checked={trackingThis}
            onCheckedChange={(v) => toggleCurrent(!!v)}
            disabled={loading || saving}
            id="entry-digest-toggle"
          />
        </div>
      </div>

      {currentRow && (
        <>
          <div className="grid sm:grid-cols-2 gap-2 pt-1 border-t border-white/10">
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-500">Notification time</Label>
              <input
                type="time"
                className="w-full rounded-md border border-zinc-700 bg-black/40 px-2 py-1.5 text-sm text-white"
                value={timeInputValueFromDb(currentRow.notify_time)}
                onChange={(e) => updateRowTime(currentRow.id, e.target.value, currentRow.timezone)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-500">Timezone (when the alarm fires)</Label>
              <Popover open={tzPickerOpen} onOpenChange={setTzPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={tzPickerOpen}
                    disabled={saving}
                    className="h-9 w-full justify-between text-xs font-mono bg-black/40 border-zinc-700 text-zinc-100"
                  >
                    <span className="truncate">{normalizeTimezoneId(currentRow.timezone)}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(100vw-2rem,26rem)] p-0 border-zinc-700" align="start">
                  <Command className="bg-zinc-950 border border-zinc-800">
                    <CommandInput placeholder="Search city or region…" className="text-xs" />
                    <CommandList>
                      <CommandEmpty className="text-xs py-3">No timezone found.</CommandEmpty>
                      <CommandGroup className="max-h-[280px] overflow-y-auto">
                        {timeZonesForPicker.map((z) => (
                          <CommandItem
                            key={z}
                            value={z}
                            className="text-xs font-mono cursor-pointer"
                            onSelect={() => {
                              const nz = normalizeTimezoneId(z);
                              updateRowTime(currentRow.id, timeInputValueFromDb(currentRow.notify_time), nz);
                              if (currentRow.schedule_mode === "tomorrow_once") {
                                void updateTracker(currentRow.id, {
                                  timezone: nz,
                                  one_off_local_date: getTomorrowDateKeyInTz(nz),
                                });
                              }
                              setTzPickerOpen(false);
                            }}
                          >
                            {z}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2 border-t border-white/10 pt-2">
            <Label className="text-[10px] text-zinc-500">Repeat</Label>
            <Select
              value={currentRow.schedule_mode || "all_days"}
              onValueChange={(v) => setScheduleMode(currentRow.id, v as ScheduleMode, currentRow.timezone)}
              disabled={saving}
            >
              <SelectTrigger className="h-9 text-xs bg-black/40 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_days">Every day</SelectItem>
                <SelectItem value="weekdays">Weekdays only (Mon–Fri)</SelectItem>
                <SelectItem value="custom">Choose days of the week</SelectItem>
                <SelectItem value="tomorrow_once">Tomorrow only (one-time)</SelectItem>
              </SelectContent>
            </Select>

            {currentRow.schedule_mode === "custom" && (
              <div className="flex flex-wrap gap-2 pt-1">
                {DAY_LABELS.map(({ bit, label }) => (
                  <label
                    key={bit}
                    className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer"
                  >
                    <Checkbox
                      checked={(currentRow.days_of_week ?? []).includes(bit)}
                      onCheckedChange={() =>
                        toggleDay(currentRow.id, bit, currentRow.days_of_week ?? [])
                      }
                      disabled={saving}
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}

            {currentRow.schedule_mode === "tomorrow_once" && (
              <p className="text-[11px] text-amber-300/90">
                Fires once on <span className="font-mono">{currentRow.one_off_local_date ?? getTomorrowDateKeyInTz(currentRow.timezone)}</span> at{" "}
                {timeInputValueFromDb(currentRow.notify_time)} ({currentRow.timezone}), then turns off.
              </p>
            )}
          </div>
        </>
      )}

      {normalized && (
        <button
          type="button"
          onClick={() => setPastOpen((o) => !o)}
          className="flex items-center gap-2 w-full text-left text-[11px] text-zinc-400 hover:text-zinc-200 border border-white/10 rounded-md px-2 py-1.5 bg-black/20"
        >
          <History className="h-3.5 w-3.5 shrink-0" />
          <span>Past entry digests for {normalized}</span>
          {pastOpen ? <ChevronUp className="h-3.5 ml-auto" /> : <ChevronDown className="h-3.5 ml-auto" />}
        </button>
      )}

      {pastOpen && (
        <div className="border border-white/10 rounded-md bg-black/30 p-2 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-[10px] px-2 gap-1"
              disabled={pastLoading || markingRead || pastAlerts.length === 0 || unreadCount === 0}
              onClick={() => markAllReadForSymbol()}
            >
              {markingRead ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
              Mark read ({normalized})
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[10px] px-2 gap-1 border-zinc-600"
              disabled={pastLoading || markingRead}
              onClick={() => markAllReadEverywhere()}
              title="Mark all entry digest notifications read (all symbols)"
            >
              Mark all read
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[10px] px-2 gap-1 border-teal-500/40 text-teal-300"
              disabled={exporting || pastLoading}
              onClick={() => exportCsv("symbol")}
            >
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              CSV ({normalized})
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] px-2 text-zinc-400"
              disabled={exporting || pastLoading}
              onClick={() => exportCsv("all")}
            >
              CSV all symbols
            </Button>
          </div>
          {unreadCount > 0 && (
            <p className="text-[10px] text-amber-400/90">{unreadCount} unread in this list</p>
          )}
          <div className="max-h-52 overflow-y-auto space-y-2 pr-0.5">
            {pastLoading ? (
              <p className="text-xs text-zinc-500">Loading…</p>
            ) : pastAlerts.length === 0 ? (
              <p className="text-xs text-zinc-500">No past notifications for this symbol yet.</p>
            ) : (
              pastAlerts.map((a) => (
                <div
                  key={a.id}
                  className={`text-[11px] border-b border-white/5 pb-2 last:border-0 last:pb-0 rounded-sm pl-2 -ml-0.5 ${
                    !a.read_at ? "border-l-2 border-l-amber-500/70 bg-amber-500/5" : ""
                  }`}
                >
                  <p className="text-zinc-200 font-medium flex items-center gap-2">
                    {a.title}
                    {!a.read_at && (
                      <span className="text-[9px] font-semibold uppercase text-amber-400/90">New</span>
                    )}
                  </p>
                  <p className="text-zinc-400 mt-0.5">{a.message}</p>
                  <p className="text-[10px] text-zinc-600 mt-1">
                    {new Date(a.created_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {a.read_at && (
                      <span className="text-zinc-500">
                        {" "}
                        · Read {new Date(a.read_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    )}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="border-t border-white/10 pt-2 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            All tracked symbols ({enabledCount}/{MAX_TRACKED} on)
          </p>
          {loading ? (
            <p className="text-xs text-zinc-500">Loading…</p>
          ) : (
            <ul className="space-y-1.5 max-h-40 overflow-y-auto">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 text-[11px] rounded border border-zinc-800/80 bg-black/20 px-2 py-1.5"
                >
                  <span className="font-mono text-teal-200/90 truncate">{r.symbol}</span>
                  <span className="text-zinc-500 shrink-0 text-[10px]">
                    {r.schedule_mode === "tomorrow_once" ? "1×" : r.schedule_mode === "weekdays" ? "Mon–Fri" : r.schedule_mode === "custom" ? "custom" : "daily"}{" "}
                    · {timeInputValueFromDb(r.notify_time)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-zinc-500 hover:text-red-400"
                    onClick={() => removeRow(r.id)}
                    disabled={saving}
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
