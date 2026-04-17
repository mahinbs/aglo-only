import { Outlet } from "react-router-dom";
import { TradingDashboardAccessGate } from "@/components/trading/TradingDashboardAccessGate";

export type AlgoToolsOutletContext = { broker: string };

/**
 * Layout for /ai-trading-analysis and /backtest.
 * Requires an active algo-tier subscription but does NOT require a provisioned OpenAlgo account —
 * these are analysis/research tools, not live-trading screens.
 */
export function AlgoToolsDashboardLayout() {
  return (
    <TradingDashboardAccessGate skipProvisioningCheck={true}>
      {(ctx) => (
        <Outlet context={{ broker: ctx.broker } as AlgoToolsOutletContext} />
      )}
    </TradingDashboardAccessGate>
  );
}
