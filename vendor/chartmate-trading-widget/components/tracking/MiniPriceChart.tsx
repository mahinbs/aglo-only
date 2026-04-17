import { useEffect, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, ReferenceLine, Tooltip, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface PricePoint { t: number; price: number; }

interface Props {
  tradeId:    string;
  entryPrice: number;
  slPrice?:   number;
  tpPrice?:   number;
  livePrice?: number;
  currency?:  "INR" | "USD";
  usdPerInr?: number | null;
}

export function MiniPriceChart({ tradeId, entryPrice, slPrice, tpPrice, livePrice, currency = "INR" }: Props) {
  const [history, setHistory] = useState<PricePoint[]>([]);

  const sym = currency === "USD" ? "$" : "₹";

  // Load historical price snapshots from trade_updates
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("trade_updates")
        .select("price, timestamp")
        .eq("trade_id", tradeId)
        .order("timestamp", { ascending: true })
        .limit(120);
      if (data) {
        setHistory(data.map((d: any) => ({
          t:     new Date(d.timestamp).getTime(),
          price: parseFloat(d.price),
        })));
      }
    };
    load();
  }, [tradeId]);

  // Append live price tick
  useEffect(() => {
    if (!livePrice) return;
    setHistory(prev => {
      const last = prev[prev.length - 1];
      if (last && Math.abs(last.price - livePrice) < 0.0001) return prev;
      return [...prev.slice(-119), { t: Date.now(), price: livePrice }];
    });
  }, [livePrice]);

  const points = history.length > 0 ? history : [{ t: Date.now(), price: entryPrice }];
  const minP   = Math.min(...points.map(p => p.price), slPrice ?? Infinity) * 0.998;
  const maxP   = Math.max(...points.map(p => p.price), tpPrice ?? -Infinity) * 1.002;

  const isUp = (livePrice ?? entryPrice) >= entryPrice;

  return (
    <div className="w-full h-28">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${tradeId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={isUp ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
              <stop offset="95%" stopColor={isUp ? "#22c55e" : "#ef4444"} stopOpacity={0}   />
            </linearGradient>
          </defs>

          <YAxis domain={[minP, maxP]} hide />

          {/* Entry line */}
          <ReferenceLine y={entryPrice} stroke="#6366f1" strokeDasharray="4 2" strokeWidth={1.5} />
          {/* Stop loss */}
          {slPrice && <ReferenceLine y={slPrice} stroke="#ef4444" strokeDasharray="3 2" strokeWidth={1.5} />}
          {/* Take profit */}
          {tpPrice && <ReferenceLine y={tpPrice} stroke="#22c55e" strokeDasharray="3 2" strokeWidth={1.5} />}

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const price = parseFloat(payload[0].value as string);
              return (
                <div className="bg-background border rounded px-2 py-1 text-xs shadow">
                  {sym}{price.toFixed(2)}
                </div>
              );
            }}
          />

          <Area
            type="monotone"
            dataKey="price"
            stroke={isUp ? "#22c55e" : "#ef4444"}
            strokeWidth={2}
            fill={`url(#grad-${tradeId})`}
            dot={false}
            animationDuration={200}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex justify-between text-[10px] text-muted-foreground px-1 -mt-1">
        <span className="text-indigo-500">— entry {sym}{entryPrice.toFixed(2)}</span>
        {slPrice && <span className="text-red-500">— SL {sym}{slPrice.toFixed(2)}</span>}
        {tpPrice && <span className="text-green-500">— TP {sym}{tpPrice.toFixed(2)}</span>}
      </div>
    </div>
  );
}
