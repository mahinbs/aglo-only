import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, AlertTriangle, Target, TrendingUp } from "lucide-react";
import { formatKeyDriver, formatPattern } from "@/lib/display-utils";
import { CardInfoTooltip } from "@/components/ui/card-info-tooltip";
import { HELP } from "@/lib/analysis-ui-help";
import { explainDriverKey, explainRiskKey, explainPatternKey } from "@/lib/insight-explanations";
import { buildExpandedReasoning, softenPunctuation } from "@/lib/expand-analysis-narrative";

interface DeepAnalysisLite {
  bullish_case?: string;
  bearish_case?: string;
  conviction_rationale?: string;
  contrarian_view?: string;
}

interface InsightsProps {
  symbol?: string;
  keyDrivers?: string[];
  riskFlags?: string[];
  opportunities?: string[];
  rationale?: string;
  patterns?: string[];
  technicalFactors?: string[];
  deepAnalysis?: DeepAnalysisLite;
  action?: "BUY" | "SELL" | "HOLD";
  confidence?: number;
  positioningNotes?: string | null;
  volumeProfile?: string | null;
}

export function Insights({
  symbol,
  keyDrivers = [],
  riskFlags = [],
  opportunities = [],
  rationale,
  patterns = [],
  technicalFactors = [],
  deepAnalysis,
  action: _action,
  confidence = 0,
  positioningNotes,
  volumeProfile,
}: InsightsProps) {
  const narrative = softenPunctuation(
    buildExpandedReasoning({
      rationale,
      positioningNotes: positioningNotes ?? undefined,
      keyDrivers,
      riskFlags,
      patterns,
      technicalFactors,
      convictionRationale: deepAnalysis?.conviction_rationale,
      bullishCase: deepAnalysis?.bullish_case,
      bearishCase: deepAnalysis?.bearish_case,
      contrarianView: deepAnalysis?.contrarian_view,
      volumeProfile: volumeProfile ?? undefined,
      symbol,
    })
  );

  return (
    <div className="space-y-6">
      {narrative.trim().length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lightbulb className="h-5 w-5 text-blue-600" />
              AI Analysis
            </CardTitle>
            <CardInfoTooltip text={HELP.aiInsights} />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
              {narrative}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/60 pt-3">
              Internal model agreement is about {confidence}%. Flow and sentiment on other widgets can look strong while this symbol still shows mixed evidence on your chosen window.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Key Drivers
            </CardTitle>
            <CardInfoTooltip text={HELP.aiInsights} />
          </CardHeader>
          <CardContent>
            {keyDrivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No key drivers identified</p>
            ) : (
              <div className="space-y-3">
                {keyDrivers.map((driver, index) => (
                  <div key={index} className="border-b border-border/40 last:border-0 pb-3 last:pb-0">
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{formatKeyDriver(driver)}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {explainDriverKey(driver)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Risk Factors
            </CardTitle>
            <CardInfoTooltip text={HELP.aiInsights} />
          </CardHeader>
          <CardContent>
            {riskFlags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No major risk factors identified</p>
            ) : (
              <div className="space-y-3">
                {riskFlags.map((risk, index) => (
                  <div key={index} className="border-b border-border/40 last:border-0 pb-3 last:pb-0">
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-red-600 rounded-full mt-2 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{formatKeyDriver(risk)}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {explainRiskKey(risk)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {opportunities.length > 0 && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-blue-600" />
                Opportunities
              </CardTitle>
              <CardInfoTooltip text={HELP.aiInsights} />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {opportunities.map((opportunity, index) => (
                  <div key={index} className="border-b border-border/40 last:border-0 pb-3 last:pb-0">
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{formatKeyDriver(opportunity)}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {explainDriverKey(opportunity)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {patterns.length > 0 && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-secondary" />
                Patterns Detected
              </CardTitle>
              <CardInfoTooltip text={HELP.aiInsights} />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                {patterns.map((pattern, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {formatPattern(pattern)}
                  </Badge>
                ))}
              </div>
              <ul className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                {patterns.slice(0, 6).map((pattern, index) => (
                  <li key={index}>
                    <span className="font-medium text-foreground/90">{formatPattern(pattern)}: </span>
                    {explainPatternKey(pattern)}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
