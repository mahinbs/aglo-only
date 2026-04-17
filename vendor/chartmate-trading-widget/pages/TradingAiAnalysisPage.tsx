import React from "react";
import { useOutletContext } from "react-router-dom";
import { TradingAiAnalysisPanel } from "@/components/trading/TradingAiAnalysisPanel";
import { TradingDashboardShell } from "@/components/trading/TradingDashboardShell";
import type { AlgoToolsOutletContext } from "@/components/layout/AlgoToolsDashboardLayout";

/** Broker from `AlgoToolsDashboardLayout` outlet context (stable when switching vs `/backtest`). */
export default function TradingAiAnalysisPage() {
  const { broker } = useOutletContext<AlgoToolsOutletContext>();
  return (
    <TradingDashboardShell hideHeader={true} broker={broker} pageTitle="AI Trading Analysis">
      <TradingAiAnalysisPanel />
    </TradingDashboardShell>
  );
}
