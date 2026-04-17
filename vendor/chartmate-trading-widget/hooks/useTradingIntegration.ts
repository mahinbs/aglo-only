import { useState, useEffect, useCallback } from "react";
import {
  getTradingIntegration,
  setTradingIntegration,
  clearTradingIntegration,
  type UserTradingIntegration,
} from "@/services/openalgoIntegrationService";

export function useTradingIntegration() {
  const [integration, setIntegration] = useState<UserTradingIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await getTradingIntegration();
    setIntegration(data ?? null);
    setError(e ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (params: { broker: string; broker_token: string; openalgo_api_key?: string; strategy_name?: string }) => {
      setError(null);
      const { data, error: e } = await setTradingIntegration(params);
      if (e) {
        setError(e);
        return { data: null, error: e };
      }
      setIntegration(data ?? null);
      return { data, error: null };
    },
    []
  );

  const clear = useCallback(async () => {
    setError(null);
    const { error: e } = await clearTradingIntegration();
    if (e) {
      setError(e);
      return { error: e };
    }
    setIntegration(null);
    return { error: null };
  }, []);

  return {
    integration,
    hasIntegration: !!integration,
    loading,
    error,
    refresh,
    save,
    clear,
  };
}
