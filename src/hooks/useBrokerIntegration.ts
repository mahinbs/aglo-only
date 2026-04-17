import { useCallback, useEffect, useState } from "react";
import { fetchBrokerGateState, type BrokerGateState } from "@/lib/brokerIntegration";

export function useBrokerIntegration(userId: string | undefined) {
  const [state, setState] = useState<BrokerGateState>({
    hasCredentials: false,
    live: false,
    tokenExpiresAt: null,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setState({ hasCredentials: false, live: false, tokenExpiresAt: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setState(await fetchBrokerGateState(userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    brokerReady: state.live,
    brokerLoading: loading,
    refreshBroker: refresh,
    tokenExpiresAt: state.tokenExpiresAt,
    hasBrokerCredentials: state.hasCredentials,
  };
}
