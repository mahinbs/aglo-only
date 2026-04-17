/**
 * BrokerSyncSection
 *
 * Shows the user's current broker connection status and lets them
 * sync their daily broker token — all from within ChartMate.
 *
 * Each broker generates a session token valid for ONE trading day (expires midnight IST).
 * Users must re-sync each morning before trading.
 *
 * Supports all 30 brokers available in OpenAlgo.
 * For Zerodha: OAuth button → Zerodha login → OpenAlgo callback → token saved.
 * For all others: Paste today's access token directly.
 *
 * From the user's POV this is "Connect to ChartMate" — they never see OpenAlgo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getTradingIntegration,
  updateOpenalgoApiKey,
  UserTradingIntegration,
  OPEN_BROKER_SYNC_EVENT,
  BROKER_SESSION_UPDATED_EVENT,
  dispatchBrokerSessionUpdated,
} from "@/services/openalgoIntegrationService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Link2Off,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { emitAlgoRobotEvent } from "@/lib/algoRobotMessaging";

// ── All 30 OpenAlgo brokers ───────────────────────────────────────────────────

export const ALL_BROKERS: Array<{
  value: string;
  label: string;
  color: string;
  portal: string;           // direct link to token-generation page
  tokenHelp: string;        // step-by-step hint shown in UI
  oauthSupported: boolean;  // true = one-click OAuth; false = manual token paste
}> = [
  {
    value: "zerodha",
    label: "Zerodha",
    color: "text-orange-400",
    portal: "https://kite.zerodha.com",
    tokenHelp: "Click 'Connect Zerodha' — you'll be taken to Zerodha login and redirected back automatically.",
    oauthSupported: true,
  },
  {
    value: "upstox",
    label: "Upstox",
    color: "text-purple-400",
    portal: "https://developer.upstox.com/apps",
    tokenHelp: "Open Upstox Developer portal → select your App → click 'Get Access Token' → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "angel",
    label: "Angel One (SmartAPI)",
    color: "text-blue-400",
    portal: "https://smartapi.angelbroking.com/token-generator",
    tokenHelp: "Open SmartAPI Token Generator → enter your Client ID + TOTP → copy the JWT token and paste here.",
    oauthSupported: false,
  },
  {
    value: "fyers",
    label: "Fyers",
    color: "text-green-400",
    portal: "https://api.fyers.in/api/v2/generate-authcode?client_id=",
    tokenHelp: "Open Fyers API portal → Dashboard → click 'Generate Token' for your app → copy access_token and paste here.",
    oauthSupported: false,
  },
  {
    value: "dhan",
    label: "Dhan",
    color: "text-teal-400",
    portal: "https://dhanhq.co/developer/apps",
    tokenHelp: "Open DhanHQ Developer → My Apps → Access Token → generate today's token and paste here.",
    oauthSupported: false,
  },
  {
    value: "aliceblue",
    label: "Alice Blue",
    color: "text-sky-400",
    portal: "https://ant.aliceblueonline.com/",
    tokenHelp: "Open ANT Web → Settings → API Settings → click 'Regenerate Session Token' → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "compositedge",
    label: "Compositedge",
    color: "text-indigo-400",
    portal: "https://compositedge.com/",
    tokenHelp: "Log in to Compositedge → API section → generate today's access token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "definedge",
    label: "Definedge",
    color: "text-yellow-400",
    portal: "https://suite.definedge.com/",
    tokenHelp: "Log in to Definedge Suite → Profile → API → generate today's access token and paste here.",
    oauthSupported: false,
  },
  {
    value: "firstock",
    label: "Firstock",
    color: "text-pink-400",
    portal: "https://connect.thefirstock.com/",
    tokenHelp: "Log in to Firstock Connect → generate today's session token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "fivepaisa",
    label: "5Paisa",
    color: "text-lime-400",
    portal: "https://dev-openapi.5paisa.com/",
    tokenHelp: "Open 5Paisa Developer portal → log in → generate today's access token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "fivepaisaxts",
    label: "5Paisa XTS",
    color: "text-lime-300",
    portal: "https://dev-openapi.5paisa.com/",
    tokenHelp: "Open 5Paisa XTS API portal → generate today's market token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "flattrade",
    label: "Flattrade",
    color: "text-orange-300",
    portal: "https://auth.flattrade.in/",
    tokenHelp: "Open Flattrade auth portal → log in → copy the access token from the redirect URL and paste here.",
    oauthSupported: false,
  },
  {
    value: "groww",
    label: "Groww",
    color: "text-emerald-400",
    portal: "https://developer.groww.in/apps",
    tokenHelp: "Open Groww Developer → your App → Generate Access Token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "ibulls",
    label: "IBULLS (Indiabulls)",
    color: "text-blue-300",
    portal: "https://indiabulls.com/",
    tokenHelp: "Log in to Indiabulls Securities API portal → generate today's session token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "iifl",
    label: "IIFL Securities",
    color: "text-amber-400",
    portal: "https://api.iiflsecurities.com/",
    tokenHelp: "Open IIFL API portal → generate today's interactive token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "indmoney",
    label: "INDmoney",
    color: "text-green-300",
    portal: "https://indmoney.com/",
    tokenHelp: "Open INDmoney Developer section → generate access token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "jainamxts",
    label: "Jainam XTS",
    color: "text-violet-400",
    portal: "https://jainam.in/",
    tokenHelp: "Log in to Jainam XTS API portal → generate today's market + interactive token → paste here.",
    oauthSupported: false,
  },
  {
    value: "kotak",
    label: "Kotak Neo",
    color: "text-red-300",
    portal: "https://napi.kotaksecurities.com/",
    tokenHelp: "Open Kotak Neo API portal → generate today's token using your Mobile + MPIN + TOTP → paste here.",
    oauthSupported: false,
  },
  {
    value: "motilal",
    label: "Motilal Oswal",
    color: "text-yellow-300",
    portal: "https://openapi.motilaloswal.com/",
    tokenHelp: "Open Motilal OpenAPI portal → log in → Dashboard → generate today's access token → paste here.",
    oauthSupported: false,
  },
  {
    value: "mstock",
    label: "mStock (Mirae Asset)",
    color: "text-cyan-400",
    portal: "https://mstock.in/",
    tokenHelp: "Open mStock API portal → log in with your Client ID + Password + TOTP → copy token and paste here.",
    oauthSupported: false,
  },
  {
    value: "nubra",
    label: "Nubra (Angel Arc)",
    color: "text-fuchsia-400",
    portal: "https://smartapi.angelbroking.com/",
    tokenHelp: "Open Angel SmartAPI → generate today's token using TOTP → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "paytm",
    label: "Paytm Money",
    color: "text-blue-400",
    portal: "https://developer.paytmmoney.com/",
    tokenHelp: "Open Paytm Money Developer → Apps → Authorize → copy the access token from the URL and paste here.",
    oauthSupported: false,
  },
  {
    value: "pocketful",
    label: "Pocketful",
    color: "text-rose-400",
    portal: "https://pocketful.in/developer",
    tokenHelp: "Open Pocketful Developer portal → OAuth → generate today's access token → paste here.",
    oauthSupported: false,
  },
  {
    value: "samco",
    label: "SAMCO",
    color: "text-teal-300",
    portal: "https://developers.samco.in/",
    tokenHelp: "Open SAMCO Developer portal → login API → generate session token using your Year of Birth → paste here.",
    oauthSupported: false,
  },
  {
    value: "shoonya",
    label: "Shoonya (Finvasia)",
    color: "text-green-400",
    portal: "https://shoonya.finvasia.com/",
    tokenHelp: "Open Shoonya web portal → log in with User ID + Password + TOTP → copy session token and paste here.",
    oauthSupported: false,
  },
  {
    value: "tradejini",
    label: "Tradejini",
    color: "text-orange-400",
    portal: "https://api.tradejini.com/",
    tokenHelp: "Open Tradejini API portal → generate today's access token using your credentials → paste here.",
    oauthSupported: false,
  },
  {
    value: "wisdom",
    label: "Wisdom Capital",
    color: "text-amber-300",
    portal: "https://wisdomcapital.in/",
    tokenHelp: "Open Wisdom Capital API portal → generate today's session token → copy and paste here.",
    oauthSupported: false,
  },
  {
    value: "zebu",
    label: "Zebu",
    color: "text-sky-300",
    portal: "https://in.zebuetrade.com/",
    tokenHelp: "Open Zebu API portal → log in with User ID + Password + TOTP → copy access token and paste here.",
    oauthSupported: false,
  },
  {
    value: "dhan_sandbox",
    label: "Dhan (Sandbox)",
    color: "text-zinc-400",
    portal: "https://dhanhq.co/developer/apps",
    tokenHelp: "Dhan sandbox — open DhanHQ Developer → Sandbox → copy test access token and paste here.",
    oauthSupported: false,
  },
];

// quick lookup by value
const BROKER_MAP = Object.fromEntries(ALL_BROKERS.map(b => [b.value, b]));
const DEFAULT_BROKER = ALL_BROKERS[0];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isTokenExpired(integration: UserTradingIntegration | null): boolean {
  if (!integration?.token_expires_at) return true;
  return new Date(integration.token_expires_at).getTime() < Date.now();
}

function isTokenFresh(integration: UserTradingIntegration | null): boolean {
  if (!integration?.api_key_encrypted?.trim()) return false;
  return !isTokenExpired(integration);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  broker?: string;   // broker pre-set from algo_onboarding; if absent, user can pick
  compact?: boolean; // smaller warning banner for PredictPage
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BrokerSyncSection({ broker: brokerProp, compact = false }: Props) {
  const [integration, setIntegration]     = useState<UserTradingIntegration | null>(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [oauthLoading, setOauthLoading]     = useState(false);
  const [manualToken, setManualToken]       = useState("");
  const [showPaste, setShowPaste]           = useState(false);
  const [selectedBroker, setSelectedBroker] = useState<string>(brokerProp ?? "");
  const [openalgoKey, setOpenalgoKey]       = useState("");
  const [savingKey, setSavingKey]           = useState(false);
  const [showKeyInput, setShowKeyInput]     = useState(false);

  // resolve broker: prop > integration > user pick > first in list
  const brokerKey  = (brokerProp ?? selectedBroker ?? integration?.broker ?? "").toLowerCase();
  const brokerInfo = BROKER_MAP[brokerKey] ?? DEFAULT_BROKER;
  const fresh   = isTokenFresh(integration);
  const expired = !fresh && !!integration?.api_key_encrypted?.trim();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await getTradingIntegration();
    setIntegration(data);
    if (!brokerProp && data?.broker) setSelectedBroker(data.broker);
    setLoading(false);
  }, [brokerProp]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onSessionUpdated = () => {
      void load();
    };
    window.addEventListener(BROKER_SESSION_UPDATED_EVENT, onSessionUpdated);
    return () => window.removeEventListener(BROKER_SESSION_UPDATED_EVENT, onSessionUpdated);
  }, [load]);

  // ── Zerodha OAuth ─────────────────────────────────────────────────────────
  const handleZerodhaOAuth = useCallback(async () => {
    setOauthLoading(true);
    emitAlgoRobotEvent(
      "Broker authentication started",
      "Opening secure broker login to refresh your execution session.",
      "info",
    );
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Sign in required to connect your broker.");
        return;
      }
      const res = await supabase.functions.invoke("get-zerodha-login-url", {
        body: { return_url: `${window.location.origin}/broker-callback` },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = res.data as { url?: string; error?: string } | null;
      if (res.error || d?.error) {
        toast.error(d?.error ?? res.error?.message ?? "Could not get login URL");
        return;
      }
      if (d?.url) {
        window.location.href = d.url;
        return;
      }
      toast.error("No login URL returned. Check get-zerodha-login-url edge function.");
    } catch (e: unknown) {
      toast.error("Error: " + ((e as Error).message ?? "unknown"));
    } finally {
      setOauthLoading(false);
    }
  }, []);

  const brokerKeyRef = useRef(brokerKey);
  brokerKeyRef.current = brokerKey;
  const zerodhaOAuthRef = useRef(handleZerodhaOAuth);
  zerodhaOAuthRef.current = handleZerodhaOAuth;

  useEffect(() => {
    const onOpenSync = () => {
      document.getElementById("broker-sync-connect")?.scrollIntoView({ behavior: "smooth", block: "start" });
      const key = brokerKeyRef.current;
      if (!key) {
        toast.error("Choose your broker in the Broker Sync bar first.");
        return;
      }
      const info = BROKER_MAP[key] ?? DEFAULT_BROKER;
      if (info.oauthSupported) {
        void zerodhaOAuthRef.current();
      } else {
        setShowPaste(true);
      }
    };
    window.addEventListener(OPEN_BROKER_SYNC_EVENT, onOpenSync);
    return () => window.removeEventListener(OPEN_BROKER_SYNC_EVENT, onOpenSync);
  }, []);

  // ── Manual token paste ────────────────────────────────────────────────────
  const handleSaveToken = async () => {
    if (!manualToken.trim()) { toast.error("Please paste your access token"); return; }
    if (!brokerKey) { toast.error("Please select your broker first"); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("sync-broker-session", {
        body: { broker: brokerKey, auth_token: manualToken.trim() },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const d = res.data as { success?: boolean; openalgo_synced?: boolean; openalgo_note?: string } | null;
      if (res.error || !d?.success) {
        toast.error("Failed to save token: " + (res.error?.message ?? "Unknown error"));
        return;
      }
      toast.success(d.openalgo_synced
        ? `${brokerInfo.label} synced! Live orders will route through ChartMate.`
        : ("Token saved. " + (d.openalgo_note ?? "")));
      emitAlgoRobotEvent(
        "Broker session active",
        `${brokerInfo.label} token synced. Execution engine can place orders.`,
        "success",
      );
      setManualToken("");
      setShowPaste(false);
      await load();
      dispatchBrokerSessionUpdated();
    } catch (e: any) {
      toast.error("Error: " + (e.message ?? "unknown"));
    } finally {
      setSaving(false);
    }
  };

  // ── OpenAlgo API key one-time setup ───────────────────────────────────────
  const handleSaveOpenalgoKey = async () => {
    if (!openalgoKey.trim()) { toast.error("Paste your OpenAlgo API key"); return; }
    setSavingKey(true);
    try {
      const { error } = await updateOpenalgoApiKey(openalgoKey.trim());
      if (error) { toast.error("Failed to save: " + error); return; }
      toast.success("OpenAlgo API key saved! Options data will now load automatically.");
      emitAlgoRobotEvent(
        "Execution credentials ready",
        "API key saved. Live data and strategy execution checks are enabled.",
        "success",
      );
      setOpenalgoKey("");
      setShowKeyInput(false);
      await load();
      dispatchBrokerSessionUpdated();
    } catch (e: any) {
      toast.error("Error: " + (e.message ?? "unknown"));
    } finally {
      setSavingKey(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking broker status…
      </div>
    );
  }

  // ── Compact mode (warning banner on PredictPage) ──────────────────────────
  if (compact) {
    if (fresh) {
      return (
        <div className="flex items-center gap-2 text-xs text-teal-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>
            <span className={`font-semibold ${brokerInfo.color}`}>{brokerInfo.label}</span>
            {" "}connected · valid until midnight IST
          </span>
        </div>
      );
    }
    return (
      <Alert className="bg-amber-500/10 border-amber-500/40 text-amber-300 py-2.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <AlertDescription className="text-xs flex items-center justify-between gap-2 flex-wrap">
          <span>
            {expired
              ? `${brokerInfo.label} session expired. Re-sync to place live orders.`
              : "Broker not connected. Sync your broker to place live orders."}
          </span>
          <a href="/algo-setup" className="underline text-amber-300 hover:text-amber-200 font-semibold shrink-0">
            Sync Now →
          </a>
        </AlertDescription>
      </Alert>
    );
  }

  // ── Full card ─────────────────────────────────────────────────────────────
  const missingApiKey = fresh && !integration?.openalgo_api_key?.trim();

  return (
    <div
      id="broker-sync-connect"
      className={`flex flex-col gap-2 p-3 rounded-xl border bg-zinc-950/50 backdrop-blur-sm ${fresh ? (missingApiKey ? "border-amber-500/30" : "border-teal-500/20") : expired ? "border-amber-500/20" : "border-zinc-800"}`}
    >
      {/* ── Main status row ──────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {fresh ? (
              <div className={`h-8 w-8 rounded-full flex items-center justify-center border ${missingApiKey ? "bg-amber-500/10 border-amber-500/20" : "bg-teal-500/10 border-teal-500/20"}`}>
                {missingApiKey ? <Link2Off className="h-4 w-4 text-amber-400" /> : <Link2 className="h-4 w-4 text-teal-400" />}
              </div>
            ) : expired ? (
              <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                <Link2Off className="h-4 w-4 text-amber-400" />
              </div>
            ) : (
              <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                <Link2Off className="h-4 w-4 text-zinc-400" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                Broker Sync
                {fresh && !missingApiKey ? (
                  <Badge className="bg-teal-500/10 text-teal-400 border-teal-500/30 text-[9px] px-1.5 py-0">Connected</Badge>
                ) : fresh && missingApiKey ? (
                  <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[9px] px-1.5 py-0">Setup Required</Badge>
                ) : expired ? (
                  <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[9px] px-1.5 py-0">Expired</Badge>
                ) : (
                  <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-[9px] px-1.5 py-0">Not Connected</Badge>
                )}
              </h3>
              <p className="text-[11px] text-zinc-500">
                {fresh && integration?.token_expires_at ? (
                  <>Valid until {new Date(integration.token_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
                ) : (
                  <>Session resets daily at midnight IST</>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {!brokerProp && (!fresh || !integration) && (
            <Select value={selectedBroker} onValueChange={setSelectedBroker}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white h-9 w-[180px] text-xs">
                <SelectValue placeholder="Choose broker…" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700 max-h-72">
                {ALL_BROKERS.map((b) => (
                  <SelectItem key={b.value} value={b.value} className="text-zinc-200 text-xs">
                    <span className={b.color}>{b.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(fresh && integration) && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-md border border-zinc-800">
              <span className={`text-xs font-semibold ${brokerInfo.color}`}>{brokerInfo.label}</span>
            </div>
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {brokerInfo.oauthSupported ? (
              <Button type="button" onClick={handleZerodhaOAuth} disabled={oauthLoading} size="sm" className="h-9 px-4 bg-orange-500 hover:bg-orange-400 text-white font-bold w-full sm:w-auto">
                {oauthLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
                {fresh ? "Re-sync" : "Connect"}
              </Button>
            ) : (
              <>
                {!showPaste ? (
                  <Button type="button" onClick={() => setShowPaste(true)} variant="outline" size="sm" disabled={!brokerKey} className="h-9 border-zinc-700 hover:bg-zinc-800 font-bold w-full sm:w-auto">
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    {fresh ? "Re-sync" : "Connect"}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 w-full sm:w-auto bg-zinc-900 p-1 rounded-lg border border-zinc-700">
                    <Input value={manualToken} onChange={(e) => setManualToken(e.target.value)} placeholder="Paste your access token here…"
                        className="bg-zinc-950 border-0 text-xs text-white placeholder:text-zinc-600 focus-visible:ring-0 h-7 w-[180px]"
                        autoFocus
                      />
                    <Button type="button" onClick={handleSaveToken} disabled={saving} size="sm" className="h-7 px-3 bg-teal-500 hover:bg-teal-400 text-black text-xs font-bold">
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button type="button" onClick={() => { setShowPaste(false); setManualToken(""); }} variant="ghost" size="sm" className="h-7 px-2 text-zinc-400 hover:text-white">
                      Cancel
                    </Button>
                  </div>
                )}
                {brokerKey && !showPaste && (
                  <a href={brokerInfo.portal} target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center justify-center gap-1.5 h-9 px-3 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 hover:text-teal-400 hover:border-teal-500/30 transition-colors">
                    <ExternalLink className="h-3 w-3" /> Get Token
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── OpenAlgo API key one-time setup ──────────────────────────────── */}
      {missingApiKey && (
        <div className="border-t border-amber-500/20 pt-2 mt-0.5">
          <Alert className="border-amber-500/40 bg-amber-500/10 py-2.5 px-3">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <AlertDescription className="text-xs text-amber-200 space-y-2">
              <p>
                <span className="font-semibold">One-time setup needed:</span> Paste your <span className="font-mono font-semibold">OpenAlgo API key</span> so ChartMate can auto-load option chains.
                Find it in your OpenAlgo dashboard under <span className="font-semibold">Profile → API Key</span>.
              </p>
              {!showKeyInput ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-3 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold"
                  onClick={() => setShowKeyInput(true)}
                >
                  Enter OpenAlgo API Key
                </Button>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    value={openalgoKey}
                    onChange={(e) => setOpenalgoKey(e.target.value)}
                    placeholder="Paste OpenAlgo API key…"
                    className="bg-zinc-950 border-amber-500/30 text-xs text-white placeholder:text-zinc-600 h-7 w-[220px] focus-visible:ring-amber-500/40"
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingKey}
                    className="h-7 px-3 bg-teal-500 hover:bg-teal-400 text-black text-xs font-bold"
                    onClick={handleSaveOpenalgoKey}
                  >
                    {savingKey ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-zinc-400 hover:text-white text-xs"
                    onClick={() => { setShowKeyInput(false); setOpenalgoKey(""); }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
