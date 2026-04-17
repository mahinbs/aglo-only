import "./trial-demo.css";
import type { ReactNode } from "react";
import { ALGO_ROBOT_COPY } from "@/lib/algoRobotMessaging";

type Props = {
  activeTab: "algo" | "options";
  onTabChange: (tab: "algo" | "options") => void;
  marketLabel: string;
  brokerLabel: string;
  marketOpen: boolean;
  children: ReactNode;
};

export function TrialDemoShell({
  activeTab,
  onTabChange,
  marketLabel,
  brokerLabel,
  marketOpen,
  children,
}: Props) {
  return (
    <div className="trial-shell-wrap">
      <div className="trial-shell-topbar">
        <div className="trial-shell-market">
          <span className={`trial-shell-dot ${marketOpen ? "is-live" : ""}`} />
          {marketLabel}
        </div>
        <div className="trial-shell-broker">Broker: {brokerLabel}</div>
      </div>

      <div className="trial-shell-copy">
        <p>{ALGO_ROBOT_COPY.controlLine}</p>
        <p>{ALGO_ROBOT_COPY.legalSafeHint}</p>
      </div>

      <div className="trial-shell-tabs">
        <button
          type="button"
          className={`trial-shell-tab ${activeTab === "algo" ? "is-active" : ""}`}
          onClick={() => onTabChange("algo")}
        >
          Algo
        </button>
        <button
          type="button"
          className={`trial-shell-tab ${activeTab === "options" ? "is-active" : ""}`}
          onClick={() => onTabChange("options")}
        >
          Options
        </button>
      </div>

      {children}
    </div>
  );
}
