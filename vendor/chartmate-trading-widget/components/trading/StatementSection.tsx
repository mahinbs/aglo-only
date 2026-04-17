import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, RefreshCw, ScrollText } from "lucide-react";
import { toast } from "sonner";

type PortfolioSnapshot = {
  broker?: string | null;
  funds?: any;
  tradebook?: any[];
  orders?: any[];
  positions?: any[];
  holdings?: any[];
  token_expired?: boolean;
  token_expires_at?: string | null;
  errors?: Record<string, string | null>;
};

function pickNumericRows(obj: any): Array<{ k: string; v: number }> {
  if (!obj || typeof obj !== "object") return [];
  const out: Array<{ k: string; v: number }> = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number" && Number.isFinite(v)) out.push({ k, v });
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) out.push({ k, v: Number(v) });
  }
  // Prefer commonly expected keys first
  const priority = ["available", "cash", "net", "equity", "margin", "collateral", "opening", "utilised", "used"];
  out.sort((a, b) => {
    const ap = priority.findIndex(p => a.k.toLowerCase().includes(p));
    const bp = priority.findIndex(p => b.k.toLowerCase().includes(p));
    const as = ap === -1 ? 999 : ap;
    const bs = bp === -1 ? 999 : bp;
    if (as !== bs) return as - bs;
    return a.k.localeCompare(b.k);
  });
  return out.slice(0, 12);
}

function safeStr(v: any): string {
  if (v == null) return "—";
  return String(v);
}

export default function StatementSection() {
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [historyLimit, setHistoryLimit] = useState(500);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await supabase.functions.invoke("get-portfolio-data", {
        body: {},
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = res.data as PortfolioSnapshot;
      if (res.error || (d as any)?.error) {
        toast.error(String((d as any)?.error ?? "Failed to load statement"));
        return;
      }
      setSnapshot(d);
    } catch {
      toast.error("Failed to load statement");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrderHistory = useCallback(async (syncFirst: boolean) => {
    setOrdersLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (syncFirst) {
        const syncRes = await supabase.functions.invoke("sync-order-history", {
          body: {},
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const syncData = syncRes.data as any;
        if (syncRes.error || syncData?.error) {
          toast.error(String(syncData?.error ?? syncRes.error?.message ?? "Order sync failed"));
        } else if (typeof syncData?.synced_count === "number") {
          toast.info(`Orders synced: ${syncData.synced_count}`, { duration: 2500 });
        }
      }

      const { data, error } = await supabase
        .from("openalgo_order_history" as any)
        .select("*")
        .eq("user_id", session.user.id)
        .order("order_timestamp", { ascending: false })
        .limit(historyLimit);

      if (error) {
        toast.error(error.message);
        return;
      }
      setOrderHistory(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load settlement history");
    } finally {
      setOrdersLoading(false);
    }
  }, [historyLimit]);

  useEffect(() => {
    load();
    loadOrderHistory(true);
  }, [load, loadOrderHistory]);

  useEffect(() => {
    // when user clicks "Load more"
    if (historyLimit > 0) loadOrderHistory(false);
  }, [historyLimit, loadOrderHistory]);

  const fundsRows = useMemo(() => pickNumericRows(snapshot?.funds), [snapshot?.funds]);
  const trades = Array.isArray(snapshot?.tradebook) ? snapshot!.tradebook! : [];

  return (
    <div className="space-y-4">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-teal-400" />
                Statement
              </CardTitle>
              <CardDescription className="text-zinc-500 text-xs">
                Shows settled executions (tradebook) + a simple “why funds are this amount” breakdown from your broker snapshot.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
              onClick={load}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {snapshot?.token_expired ? (
            <Alert className="bg-amber-950/30 border-amber-900/50">
              <AlertDescription className="text-amber-300 text-xs">
                Broker session looks expired. Hit <strong>Re-sync</strong> above, then refresh this statement.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded border border-zinc-800 bg-black/30 p-3">
              <p className="text-xs text-zinc-300 font-medium mb-2">Funds snapshot (broker)</p>
              {fundsRows.length ? (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {fundsRows.map(({ k, v }) => (
                    <div key={k} className="contents">
                      <span className="text-zinc-500">{k}</span>
                      <span className="text-zinc-200 font-mono text-right">{v.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No funds breakdown available for this broker response.</p>
              )}
            </div>

            <div className="rounded border border-zinc-800 bg-black/30 p-3">
              <p className="text-xs text-zinc-300 font-medium mb-2">Why “current money” changes</p>
              <ul className="text-xs text-zinc-500 space-y-1 list-disc pl-4">
                <li>Settled P&L from executed trades (tradebook) changes cash over the day.</li>
                <li>Open positions affect margin/collateral and can move due to MTM.</li>
                <li>Broker charges/taxes/interest can change the net available.</li>
              </ul>
              <p className="text-[11px] text-zinc-600 mt-2">
                For a full ledger (deposits/withdrawals/charges), we’d need the broker “ledger/statement” API (not all brokers expose it consistently).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white">Settled executions (tradebook)</CardTitle>
          <CardDescription className="text-zinc-500 text-xs">
            Latest fills from the broker. If empty, either there were no trades, or broker doesn’t return tradebook for the day.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-950">
                <tr className="text-zinc-500">
                  <th className="text-left font-medium px-3 py-2">Time</th>
                  <th className="text-left font-medium px-3 py-2">Symbol</th>
                  <th className="text-left font-medium px-3 py-2">Side</th>
                  <th className="text-right font-medium px-3 py-2">Qty</th>
                  <th className="text-right font-medium px-3 py-2">Price</th>
                  <th className="text-left font-medium px-3 py-2">Order</th>
                </tr>
              </thead>
              <tbody>
                {trades.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-zinc-600">
                      No tradebook data.
                    </td>
                  </tr>
                ) : (
                  trades.slice(0, 200).map((t: any, idx: number) => (
                    <tr key={idx} className="border-t border-zinc-800/60">
                      <td className="px-3 py-2 text-zinc-400">{safeStr(t.trade_time ?? t.timestamp ?? t.time)}</td>
                      <td className="px-3 py-2 font-mono text-zinc-200">{safeStr(t.symbol ?? t.tradingsymbol)}</td>
                      <td className="px-3 py-2 text-zinc-300">{safeStr(t.transaction_type ?? t.side ?? t.action)}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-200">{safeStr(t.quantity ?? t.qty)}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-200">{safeStr(t.price ?? t.average_price ?? t.avg_price)}</td>
                      <td className="px-3 py-2 text-zinc-500 font-mono">{safeStr(t.order_id ?? t.orderid ?? t.orderId)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm text-white">Settlements history (all orders)</CardTitle>
              <CardDescription className="text-zinc-500 text-xs">
                Full synced order history from `openalgo_order_history` (keeps older settled orders).
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                onClick={() => loadOrderHistory(true)}
                disabled={ordersLoading}
              >
                {ordersLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-2">Sync</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-950">
                <tr className="text-zinc-500">
                  <th className="text-left font-medium px-3 py-2">Time</th>
                  <th className="text-left font-medium px-3 py-2">Symbol</th>
                  <th className="text-left font-medium px-3 py-2">Side</th>
                  <th className="text-right font-medium px-3 py-2">Qty</th>
                  <th className="text-right font-medium px-3 py-2">Avg</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                  <th className="text-left font-medium px-3 py-2">Strategy</th>
                  <th className="text-left font-medium px-3 py-2">Order</th>
                </tr>
              </thead>
              <tbody>
                {orderHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-zinc-600">
                      {ordersLoading ? "Loading…" : "No order history yet."}
                    </td>
                  </tr>
                ) : (
                  orderHistory.map((o: any, idx: number) => (
                    <tr key={idx} className="border-t border-zinc-800/60">
                      <td className="px-3 py-2 text-zinc-400">{safeStr(o.order_timestamp)}</td>
                      <td className="px-3 py-2 font-mono text-zinc-200">{safeStr(o.symbol)}</td>
                      <td className="px-3 py-2 text-zinc-300">{safeStr(o.action)}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-200">{safeStr(o.filled_quantity ?? o.quantity)}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-200">{safeStr(o.average_price ?? o.price)}</td>
                      <td className="px-3 py-2 text-zinc-300">{safeStr(o.status)}</td>
                      <td className="px-3 py-2 text-zinc-500">{safeStr(o.strategy_name)}</td>
                      <td className="px-3 py-2 text-zinc-500 font-mono">{safeStr(o.broker_order_id)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 border-t border-zinc-800/60 flex items-center justify-between">
            <p className="text-[11px] text-zinc-600">
              Showing <span className="text-zinc-300">{orderHistory.length}</span> rows
            </p>
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
              onClick={() => setHistoryLimit((n) => Math.min(5000, n + 500))}
              disabled={ordersLoading || historyLimit >= 5000}
            >
              Load more
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

