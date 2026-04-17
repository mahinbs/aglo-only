import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Link2Off } from "lucide-react";
import BrokerSyncSection from "@/components/trading/BrokerSyncSection";
import {
  getTradingIntegration,
  isBrokerSessionLive,
  BROKER_SESSION_UPDATED_EVENT,
  dispatchOpenBrokerSync,
} from "@/services/openalgoIntegrationService";
import { ALGO_ROBOT_COPY, emitAlgoRobotEvent } from "@/lib/algoRobotMessaging";
import { trackRobotMetric } from "@/lib/algoRobotExperience";
import { EntryPointNotificationsHeaderButton } from "@/components/EntryPointNotificationsBell";
import { ScheduledDigestClientTrigger } from "@/components/ScheduledDigestClientTrigger";
import { DashboardShellLayout } from "../layout/DashboardShellLayout";

// ── Market status (IST) — shared by algo trading pages ─────────────────────────

type MarketSession = "pre_market" | "open" | "post_market" | "closed" | "weekend";

interface MarketStatus {
  session: MarketSession;
  label: string;
  sublabel: string;
  color: string;
  bg: string;
  dot: string;
  opensIn?: string;
  closesIn?: string;
}

function getISTNow(): { h: number; m: number; day: number } {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utcMs + 5.5 * 3600000);
  return { h: ist.getHours(), m: ist.getMinutes(), day: ist.getDay() };
}

function toMinutes(h: number, m: number) {
  return h * 60 + m;
}

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function computeMarketStatus(): MarketStatus {
  const { h, m, day } = getISTNow();
  const now = toMinutes(h, m);

  const PRE_START = toMinutes(9, 0);
  const MKT_START = toMinutes(9, 15);
  const MKT_END = toMinutes(15, 30);
  const POST_END = toMinutes(16, 0);

  const isWeekend = day === 0 || day === 6;

  if (isWeekend) {
    return {
      session: "weekend",
      label: "Market Closed",
      sublabel: `Weekend — opens Mon 9:15 AM IST`,
      color: "text-zinc-400",
      bg: "bg-zinc-800/40 border-zinc-700/40",
      dot: "bg-zinc-500",
    };
  }

  if (now < PRE_START) {
    const opensIn = fmtDuration(MKT_START - now);
    return {
      session: "closed",
      label: "Market Closed",
      sublabel: `Pre-market starts 9:00 AM IST`,
      color: "text-zinc-400",
      bg: "bg-zinc-800/40 border-zinc-700/40",
      dot: "bg-zinc-500",
      opensIn,
    };
  }

  if (now >= PRE_START && now < MKT_START) {
    const opensIn = fmtDuration(MKT_START - now);
    return {
      session: "pre_market",
      label: "Pre-Market",
      sublabel: `Call auction — regular session in ${opensIn}`,
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
      dot: "bg-amber-400",
      opensIn,
    };
  }

  if (now >= MKT_START && now < MKT_END) {
    const closesIn = fmtDuration(MKT_END - now);
    return {
      session: "open",
      label: "Market Open",
      sublabel: `NSE/BSE live — closes in ${closesIn} (3:30 PM IST)`,
      color: "text-green-400",
      bg: "bg-green-500/10 border-green-500/20",
      dot: "bg-green-400",
      closesIn,
    };
  }

  if (now >= MKT_END && now < POST_END) {
    return {
      session: "post_market",
      label: "After-Market (AMO)",
      sublabel: "Orders queued & executed at next open",
      color: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
      dot: "bg-blue-400",
    };
  }

  return {
    session: "closed",
    label: "Market Closed",
    sublabel: "Opens 9:00 AM IST (Mon–Fri)",
    color: "text-zinc-400",
    bg: "bg-zinc-800/40 border-zinc-700/40",
    dot: "bg-zinc-500",
  };
}

function useMarketStatus(): MarketStatus {
  const [status, setStatus] = useState<MarketStatus>(computeMarketStatus);

  useEffect(() => {
    const id = setInterval(() => setStatus(computeMarketStatus()), 30000);
    return () => clearInterval(id);
  }, []);

  return status;
}

export interface TradingDashboardShellProps {
  broker: string;
  children: React.ReactNode;
  /** Shown next to “Live Trading Dashboard” (e.g. page section title). */
  pageTitle?: string;
  hideHeader?: boolean;
}

export function TradingDashboardShell({ broker, children, pageTitle, hideHeader }: TradingDashboardShellProps) {
  const market = useMarketStatus();
  const brokerLabel = broker.charAt(0).toUpperCase() + broker.slice(1);
  const [sessionLive, setSessionLive] = useState<boolean | null>(null);

  const refreshBrokerHeader = useCallback(async () => {
    const { data } = await getTradingIntegration();
    setSessionLive(isBrokerSessionLive(data));
  }, []);

  useEffect(() => {
    if (hideHeader) return;
    void refreshBrokerHeader();
    const onUpd = () => {
      void refreshBrokerHeader();
    };
    window.addEventListener(BROKER_SESSION_UPDATED_EVENT, onUpd);
    const t = window.setInterval(() => void refreshBrokerHeader(), 120_000);
    return () => {
      window.removeEventListener(BROKER_SESSION_UPDATED_EVENT, onUpd);
      window.clearInterval(t);
    };
  }, [hideHeader, refreshBrokerHeader]);

  return (
    <DashboardShellLayout>
      <div className="min-h-screen bg-black text-zinc-100">
        <ScheduledDigestClientTrigger />
        {!hideHeader && <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/90 backdrop-blur-xl">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <h1 className="text-base font-bold text-white tracking-tight truncate max-lg:hidden">
                  Live Trading Dashboard
                  {pageTitle ? (
                    <span className="text-zinc-500 font-normal"> · {pageTitle}</span>
                  ) : null}
                </h1>
                <p className="text-[11px] text-zinc-500">Powered by {brokerLabel} via OpenAlgo</p>
                <p className="hidden sm:block text-[10px] text-zinc-600 mt-0.5 max-w-xl leading-snug">
                  Equities and options (F&amp;O) use live market data through OpenAlgo when your broker session
                  is active — connect if sync shows expired. Open the{" "}
                  <span className="text-zinc-400">Options strategies</span> tab below for F&amp;O.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${market.bg} ${market.color}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${market.dot} ${market.session === "open" ? "animate-pulse" : ""}`}
                />
                {market.label}
              </span>
              {sessionLive === null ? (
                <span className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-800/80 border border-zinc-700 px-3 py-1.5 rounded-full">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  Broker…
                </span>
              ) : sessionLive ? (
                <span className="flex items-center gap-1.5 text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                  {brokerLabel} · Session active
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    dispatchOpenBrokerSync();
                    emitAlgoRobotEvent(
                      "Broker reconnect requested",
                      "Reconnect flow opened. Live execution resumes after session sync.",
                      "warning",
                    );
                    void trackRobotMetric("broker_reconnect_click");
                  }}
                  className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-full hover:bg-amber-500/20 transition-colors cursor-pointer"
                >
                  <Link2Off className="h-3 w-3 shrink-0" />
                  Reconnect broker
                </button>
              )}
              <EntryPointNotificationsHeaderButton />
            </div>
          </div>
        </header>}

        <main className="container mx-auto px-4 py-5">
          {!hideHeader && (
            <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
              <p className="text-xs text-zinc-200">{ALGO_ROBOT_COPY.controlLine}</p>
              <p className="text-[11px] text-zinc-500">{ALGO_ROBOT_COPY.legalSafeHint}</p>
            </div>
          )}
          {!hideHeader && <div className="mb-5">
            <BrokerSyncSection broker={broker} />
          </div>}
          {children}
        </main>
      </div>
    </DashboardShellLayout>
  );
}

export function TradingDashboardLoadingScreen() {
  return (
    <DashboardShellLayout>
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    </DashboardShellLayout>
  );
}
