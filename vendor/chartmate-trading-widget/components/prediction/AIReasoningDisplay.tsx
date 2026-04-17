import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { LucideIcon } from "lucide-react";
import {
  Lightbulb,
  TrendingUp,
  Activity,
  Target,
  AlertTriangle,
  TrendingDown,
  Shield,
  BarChart3,
  ChevronDown,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { formatTechnicalFactor, formatKeyDriver } from "@/lib/display-utils";
import { buildExpandedReasoning, softenPunctuation } from "@/lib/expand-analysis-narrative";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CardInfoTooltip } from "@/components/ui/card-info-tooltip";
import { HELP } from "@/lib/analysis-ui-help";
import { buildReasoningGlossaryItems } from "@/lib/insight-explanations";

interface DeepAnalysis {
  bullish_case?: string;
  bearish_case?: string;
  contrarian_view?: string;
  conviction_rationale?: string;
  invalidation_triggers?: string[];
  risk_reward_ratio?: number;
  success_probability?: number;
}

interface MarketContext {
  correlation_insight?: string;
  sector_strength?: string;
  macro_factors?: string;
  institutional_activity?: string;
}

interface AIReasoningDisplayProps {
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  technicalFactors?: string[];
  fundamentalFactors?: string[];
  keyDrivers?: string[];
  riskFlags?: string[];
  oneLineSummary?: string;
  deepAnalysis?: DeepAnalysis;
  marketContext?: MarketContext;
  positioningNotes?: string | null;
  volumeProfile?: string | null;
  /** When this analysis was produced; shown with glossary so readers know signals are snapshot-based. */
  analysedAt?: Date | null;
}

const tileClass =
  "p-3 bg-background rounded-lg border border-primary/20 shadow-sm shadow-black/5";

function SectionLabel({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 mb-2", className)}>
      <Icon className="h-4 w-4 text-primary shrink-0" />
      <span className="font-semibold text-sm text-foreground">{children}</span>
    </div>
  );
}

export function AIReasoningDisplay({
  symbol,
  action,
  confidence,
  technicalFactors = [],
  fundamentalFactors = [],
  keyDrivers = [],
  riskFlags = [],
  oneLineSummary,
  deepAnalysis,
  marketContext,
  positioningNotes,
  volumeProfile,
  analysedAt,
}: AIReasoningDisplayProps) {
  const [showBullBear, setShowBullBear] = useState(true);
  const [showMarketContext, setShowMarketContext] = useState(true);

  const narrativeSummary = useMemo(() => {
    const expanded = buildExpandedReasoning({
      rationale: oneLineSummary,
      positioningNotes: positioningNotes ?? undefined,
      keyDrivers,
      riskFlags,
      patterns: undefined,
      technicalFactors,
      convictionRationale: deepAnalysis?.conviction_rationale,
      bullishCase: deepAnalysis?.bullish_case,
      bearishCase: deepAnalysis?.bearish_case,
      contrarianView: deepAnalysis?.contrarian_view,
      volumeProfile: volumeProfile ?? undefined,
      symbol,
    });
    return softenPunctuation(expanded);
  }, [
    oneLineSummary,
    positioningNotes,
    deepAnalysis?.conviction_rationale,
    deepAnalysis?.contrarian_view,
    deepAnalysis?.bullish_case,
    deepAnalysis?.bearish_case,
    keyDrivers,
    riskFlags,
    technicalFactors,
    volumeProfile,
    symbol,
  ]);

  const glossaryItems = useMemo(
    () => buildReasoningGlossaryItems(technicalFactors, keyDrivers, riskFlags),
    [technicalFactors, keyDrivers, riskFlags],
  );

  const glossaryShowsMacd = useMemo(
    () => glossaryItems.some((g) => /macd/i.test(g.title)),
    [glossaryItems],
  );
  const glossaryShowsRsi = useMemo(
    () => glossaryItems.some((g) => /\brsi\b/i.test(g.title)),
    [glossaryItems],
  );

  const analysedAtLabel = useMemo(() => {
    if (!analysedAt || !(analysedAt instanceof Date) || Number.isNaN(analysedAt.getTime())) {
      return null;
    }
    return analysedAt.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }, [analysedAt]);

  const actionStyles =
    action === "BUY"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : action === "SELL"
        ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
        : "border-primary/40 bg-primary/10 text-primary";

  const agreementExpl =
    confidence >= 80
      ? `The ensemble lines up fairly tightly on this window: about ${confidence}% internal agreement. That still does not guarantee price follows the lean; it means inputs were less contradictory than usual.`
      : confidence >= 60
        ? `Signals partially agree: about ${confidence}% agreement inside the model. Expect some conflict between momentum, mean reversion, and headline tone until the next sessions print clearer structure.`
        : `Inputs diverge: only about ${confidence}% model agreement, so the picture is noisy. Treat the narrative as provisional and refresh after new candles or material news.`;

  const hasMarketContext = marketContext && Object.values(marketContext).some(Boolean);

  return (
    <Card className="border-primary/30 bg-primary/5 overflow-hidden">
      <CardContent className="pt-6 space-y-4">
        {/* Title row — mirrors disclaimer card density */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
              <Lightbulb className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base tracking-tight text-foreground">AI reasoning</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                How the model explains this outlook; informational only, not advice.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end pl-12 sm:pl-0">
            <Badge variant="outline" className={cn("text-xs font-semibold border", actionStyles)}>
              {action}
            </Badge>
            <Badge
              variant="outline"
              className="text-xs font-medium border-primary/30 bg-background text-foreground"
            >
              {confidence}% confidence
            </Badge>
            <CardInfoTooltip text={HELP.aiReasoningEngine} className="text-muted-foreground" />
          </div>
        </div>

        {/* Summary — high-contrast callout so the narrative is easy to spot */}
        <Alert
          className={cn(
            "rounded-xl border-primary/45 bg-gradient-to-br from-primary/[0.14] via-primary/[0.06] to-background/95",
            "p-5 sm:p-6 shadow-[0_12px_40px_-16px_hsl(var(--primary)/0.45)] ring-1 ring-primary/20",
            "[&>svg]:left-5 [&>svg]:top-5 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-primary",
            "[&>svg~*]:pl-10",
          )}
        >
          <Sparkles className="h-5 w-5 shrink-0 drop-shadow-[0_0_10px_hsl(var(--primary)/0.35)]" />
          <AlertDescription className="space-y-3 text-base sm:text-lg [&>p]:leading-relaxed">
            <p className="!mb-0 font-bold text-lg sm:text-xl tracking-tight text-foreground">
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                At a glance
              </span>
            </p>
            <p className="!mt-2 text-base sm:text-lg md:text-[1.2rem] font-semibold leading-[1.65] text-foreground/95 whitespace-pre-line">
              {narrativeSummary}
            </p>
            {(analysedAtLabel || glossaryItems.length > 0) && (
              <div
                className={cn(
                  "mt-5 pt-5 border-t-2 border-primary/25 space-y-4",
                  glossaryItems.length > 0 &&
                    "rounded-xl border border-primary/30 bg-gradient-to-b from-primary/[0.14] via-primary/[0.05] to-background/95 p-4 sm:p-5 shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.12)] ring-1 ring-primary/15",
                )}
              >
                {analysedAtLabel && (
                  <p className="text-sm sm:text-base text-foreground/90 leading-relaxed font-medium">
                    <span className="font-bold text-foreground">When this was computed: </span>
                    {analysedAtLabel}. Indicators use the candle data available at that moment, not every later tick.
                  </p>
                )}
                {glossaryItems.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2.5 gap-y-1">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/35 bg-primary/10 text-primary">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold text-base sm:text-lg text-foreground tracking-tight">
                          Term guide
                        </p>
                        <p className="text-xs text-primary/90 font-medium uppercase tracking-wider">
                          What the words mean
                        </p>
                      </div>
                    </div>

                    <p className="text-sm sm:text-base leading-relaxed text-foreground/95 font-medium">
                      {HELP.aiReasoningTermGuideIntro}
                    </p>

                    {glossaryShowsMacd && (
                      <p className="text-sm sm:text-base leading-relaxed text-foreground/95 font-medium border-l-[3px] border-primary pl-3.5 py-1 bg-background/50 rounded-r-md">
                        {HELP.aiReasoningMacdPrimer}
                      </p>
                    )}
                    {glossaryShowsRsi && (
                      <p className="text-sm sm:text-base leading-relaxed text-foreground/95 font-medium border-l-[3px] border-amber-500/60 pl-3.5 py-1 bg-background/50 rounded-r-md">
                        {HELP.aiReasoningRsiPrimer}
                      </p>
                    )}

                    <p className="text-xs sm:text-sm font-bold text-foreground pt-1">
                      Line-by-line (same snapshot as above)
                    </p>
                    <ul className="space-y-3 list-none pl-0">
                      {glossaryItems.map(({ title, body }) => (
                        <li
                          key={title}
                          className="rounded-lg border border-primary/20 bg-background/70 px-3.5 py-3 sm:px-4 sm:py-3.5 shadow-sm"
                        >
                          <p className="text-sm sm:text-base font-bold text-foreground leading-snug mb-1.5">
                            {title}
                          </p>
                          <p className="text-sm sm:text-base leading-relaxed text-muted-foreground font-medium">
                            {body}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>

        {/* Drivers grid */}
        {(technicalFactors.length > 0 || keyDrivers.length > 0) && (
          <div className="grid md:grid-cols-2 gap-3">
            {technicalFactors.length > 0 && (
              <div className={tileClass}>
                <SectionLabel icon={Activity}>Technical factors</SectionLabel>
                <ul className="space-y-1.5">
                  {technicalFactors.slice(0, 5).map((factor, idx) => (
                    <li key={idx} className="text-xs text-muted-foreground flex gap-2 leading-relaxed">
                      <span className="text-primary font-bold leading-none mt-0.5">·</span>
                      <span>{formatTechnicalFactor(factor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {keyDrivers.length > 0 && (
              <div className={tileClass}>
                <SectionLabel icon={Target}>Key drivers</SectionLabel>
                <ul className="space-y-1.5">
                  {keyDrivers.slice(0, 5).map((driver, idx) => (
                    <li key={idx} className="text-xs text-muted-foreground flex gap-2 leading-relaxed">
                      <span className="text-primary font-bold leading-none mt-0.5">·</span>
                      <span>{formatKeyDriver(driver)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {riskFlags.length > 0 && (
          <div className={tileClass}>
            <SectionLabel icon={AlertTriangle}>Risk flags</SectionLabel>
            <ul className="space-y-1.5">
              {riskFlags.slice(0, 8).map((flag, idx) => (
                <li key={idx} className="text-xs text-muted-foreground flex gap-2 leading-relaxed">
                  <span className="text-destructive font-bold leading-none mt-0.5">·</span>
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {fundamentalFactors.length > 0 && (
          <div className={tileClass}>
            <SectionLabel icon={TrendingUp}>Fundamental factors</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {fundamentalFactors.map((factor, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="text-xs border-primary/25 bg-primary/5 text-foreground font-normal"
                >
                  {factor}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="p-4 bg-muted/50 rounded-lg border border-primary/15 text-xs space-y-2">
          <p className="font-semibold text-sm text-foreground">Model agreement (not profit odds)</p>
          <p className="text-muted-foreground leading-relaxed">{agreementExpl}</p>
        </div>

        {deepAnalysis && (
          <div className="space-y-3 pt-1 border-t border-primary/15">
            <div className="flex items-center gap-2 pt-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-sm text-foreground">Deep analysis</h4>
            </div>

            {(deepAnalysis.bullish_case || deepAnalysis.bearish_case) && (
              <Collapsible open={showBullBear} onOpenChange={setShowBullBear}>
                <CollapsibleTrigger
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-primary/20 bg-background px-3 py-2.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/50 [&[data-state=open]_svg:last-child]:rotate-180"
                >
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    Bull vs bear case
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform duration-200" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  {deepAnalysis.bullish_case && (
                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
                      <p className="font-semibold text-xs text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Bullish case
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{deepAnalysis.bullish_case}</p>
                    </div>
                  )}
                  {deepAnalysis.bearish_case && (
                    <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3">
                      <p className="font-semibold text-xs text-red-600 dark:text-red-400 mb-1.5 flex items-center gap-1.5">
                        <TrendingDown className="h-3.5 w-3.5" />
                        Bearish case
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{deepAnalysis.bearish_case}</p>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {deepAnalysis.contrarian_view && (
              <div className={cn(tileClass, "border-amber-500/25 bg-amber-500/[0.06]")}>
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="font-semibold text-sm text-foreground">Contrarian view</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{deepAnalysis.contrarian_view}</p>
              </div>
            )}

            {deepAnalysis.conviction_rationale && (
              <div className={tileClass}>
                <SectionLabel icon={Target}>Why this outlook?</SectionLabel>
                <p className="text-xs text-muted-foreground leading-relaxed">{deepAnalysis.conviction_rationale}</p>
              </div>
            )}

            {(deepAnalysis.risk_reward_ratio != null || deepAnalysis.success_probability != null) && (
              <div className="grid grid-cols-2 gap-3">
                {deepAnalysis.risk_reward_ratio != null && (
                  <div className={cn(tileClass, "text-center py-4")}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                      Risk / reward
                    </p>
                    <p className="text-2xl font-bold text-primary tabular-nums">
                      {deepAnalysis.risk_reward_ratio.toFixed(1)}:1
                    </p>
                  </div>
                )}
                {deepAnalysis.success_probability != null && (
                  <div className={cn(tileClass, "text-center py-4")}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                      Success probability
                    </p>
                    <p className="text-2xl font-bold text-primary tabular-nums">
                      {deepAnalysis.success_probability}%
                    </p>
                  </div>
                )}
              </div>
            )}

            {deepAnalysis.invalidation_triggers && deepAnalysis.invalidation_triggers.length > 0 && (
              <Alert className="border-destructive/40 bg-destructive/5">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <AlertDescription>
                  <p className="font-semibold text-sm text-foreground mb-2">Invalidation triggers</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Reassess the thesis if any of the following occur.
                  </p>
                  <ul className="space-y-1.5">
                    {deepAnalysis.invalidation_triggers.map((trigger, idx) => (
                      <li key={idx} className="text-xs text-muted-foreground flex gap-2 leading-relaxed">
                        <span className="text-destructive font-bold leading-none mt-0.5">·</span>
                        <span>{trigger}</span>
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {hasMarketContext && marketContext && (
          <div className="space-y-3 pt-1 border-t border-primary/15">
            <div className="flex items-center gap-2 pt-2">
              <Shield className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-sm text-foreground">Market context</h4>
            </div>

            <Collapsible open={showMarketContext} onOpenChange={setShowMarketContext}>
              <CollapsibleTrigger
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-primary/20 bg-background px-3 py-2.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/50 [&[data-state=open]_svg]:rotate-180"
              >
                <span>Correlation, sector &amp; macro</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform duration-200" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-2">
                {marketContext.correlation_insight && (
                  <div className={tileClass}>
                    <p className="font-semibold text-xs text-foreground mb-1">Correlation</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{marketContext.correlation_insight}</p>
                  </div>
                )}
                {marketContext.sector_strength && (
                  <div className={tileClass}>
                    <p className="font-semibold text-xs text-foreground mb-1">Sector strength</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{marketContext.sector_strength}</p>
                  </div>
                )}
                {marketContext.macro_factors && (
                  <div className={tileClass}>
                    <p className="font-semibold text-xs text-foreground mb-1">Macro environment</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{marketContext.macro_factors}</p>
                  </div>
                )}
                {marketContext.institutional_activity && (
                  <div className={tileClass}>
                    <p className="font-semibold text-xs text-foreground mb-1">Institutional activity</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {marketContext.institutional_activity}
                    </p>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pt-2 border-t border-primary/15">
          AI-generated analysis for research, verify with your own judgment and risk tolerance
        </p>
      </CardContent>
    </Card>
  );
}
