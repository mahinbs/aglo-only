import React from "react";
import { useOutletContext } from "react-router-dom";
import BacktestingSection from "@/components/trading/BacktestingSection";
import { TradingDashboardShell } from "@/components/trading/TradingDashboardShell";
import type { AlgoToolsOutletContext } from "@/components/layout/AlgoToolsDashboardLayout";

/** Broker from `AlgoToolsDashboardLayout` outlet context (stable when switching vs `/ai-trading-analysis`). */
export default function TradingBacktestPage() {
  const { broker } = useOutletContext<AlgoToolsOutletContext>();
  return (
    <TradingDashboardShell hideHeader={true} broker={broker} pageTitle="Backtesting">
      <div className="min-w-0">
        <BacktestingSection />
      </div>
    </TradingDashboardShell>
  );
}
