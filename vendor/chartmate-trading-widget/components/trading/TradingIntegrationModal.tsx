import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KeyRound, Clock, LogIn, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Only Zerodha for place-order flow */
const SUPPORTED_BROKERS: { label: string; value: string }[] = [
  { label: "Zerodha", value: "zerodha" },
];

interface TradingIntegrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onSkip?: () => void;
  save: (params: {
    broker: string;
    broker_token: string;
    openalgo_api_key?: string;
    strategy_name?: string;
  }) => Promise<{ data: unknown; error: string | null }>;
  isLoading?: boolean;
}

export function TradingIntegrationModal({
  open,
  onOpenChange,
  onSaved,
  onSkip,
  save,
  isLoading = false,
}: TradingIntegrationModalProps) {
  const [broker, setBroker] = useState("");
  const [brokerToken, setBrokerToken] = useState("");
  const [openalgoApiKey, setOpenalgoApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLoginWithZerodha = async () => {
    setError(null);
    setLoginLoading(true);
    try {
      const returnUrl = `${window.location.origin}/broker-callback`;
      const { data, error: fnError } = await supabase.functions.invoke(
        "get-zerodha-login-url",
        { body: { return_url: returnUrl } }
      );
      if (fnError) {
        const msg = fnError.message || "Could not get login URL";
        const hint = msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("cors") || msg.toLowerCase().includes("edge function")
          ? " Deploy the get-zerodha-login-url edge function and set ZERODHA_API_KEY in Supabase secrets."
          : "";
        setError(msg + hint);
        return;
      }
      if (data?.error) {
        setError(data.error);
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setError("Login URL not available. Paste your token below instead.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!broker) {
      setError("Please select your broker");
      return;
    }
    if (!brokerToken.trim()) {
      setError("Broker access token is required");
      return;
    }
    if (!openalgoApiKey.trim()) {
      setError("Trading API key is required. Copy it from trading.tradebrainx.com → API Keys.");
      return;
    }
    const result = await save({
      broker,
      broker_token: brokerToken.trim(),
      openalgo_api_key: openalgoApiKey.trim(),
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    setBrokerToken("");
    setOpenalgoApiKey("");
    onSaved();
    onOpenChange(false);
  };

  const canSave = !!broker && !!brokerToken.trim() && !!openalgoApiKey.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Connect your broker
          </DialogTitle>
          <DialogDescription>
            Select your broker. For Zerodha you can log in once here; for others paste today's access token.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="broker">Broker</Label>
            <Select value={broker} onValueChange={setBroker}>
              <SelectTrigger id="broker">
                <SelectValue placeholder="Select your broker" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_BROKERS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {broker === "zerodha" && (
            <div className="grid gap-2">
              <Label>Zerodha</Label>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleLoginWithZerodha}
                disabled={loginLoading}
              >
                <LogIn className="h-4 w-4 mr-2" />
                {loginLoading ? "Opening Zerodha…" : "Log in with Zerodha"}
              </Button>
              <p className="text-xs text-muted-foreground">
                You'll sign in on Zerodha and return here — no need to copy any token.
              </p>
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <span className="relative bg-background px-2 text-xs text-muted-foreground">
                  or paste token manually
                </span>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="broker_token">Today's access token</Label>
            <Input
              id="broker_token"
              type="password"
              placeholder="Paste your broker's daily access token"
              value={brokerToken}
              onChange={(e) => setBrokerToken(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              {broker === "zerodha"
                ? "If you already have a token from Kite, paste it here."
                : "Log in to your broker's developer portal and copy today's access token. You'll be asked to refresh it every 24 hours."}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="openalgo_api_key">
              TradeBrainX Trading API Key
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              id="openalgo_api_key"
              type="password"
              placeholder="Paste your Trading API key"
              value={openalgoApiKey}
              onChange={(e) => setOpenalgoApiKey(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Get it from{" "}
              <a
                href="https://openalgo.tradebrainx.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline inline-flex items-center gap-0.5"
              >
                trading.tradebrainx.com → API Keys
                <ExternalLink className="h-3 w-3" />
              </a>
              {" "}after logging in with Zerodha. Set this once — it never expires.
            </p>
          </div>

          <Alert className="border-amber-200 bg-amber-50 text-amber-800">
            <Clock className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Broker access tokens refresh daily. After 24 hours you'll be prompted to paste a new
              one — this is a standard security requirement of your broker.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-0">
          {onSkip && (
            <Button variant="outline" onClick={onSkip} disabled={isLoading}>
              Skip for now
            </Button>
          )}
          <Button onClick={handleSave} disabled={isLoading || !canSave}>
            {isLoading ? "Saving…" : "Save & connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
