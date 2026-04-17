import { ReactNode } from "react";

/**
 * Paper-trade hub access gate.
 *
 * Routes using this gate are already wrapped by ProtectedRoute, so users are authenticated.
 * Paper trade is a standalone feature and should not be paywalled by subscription checks.
 */
export function TradesHubGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
