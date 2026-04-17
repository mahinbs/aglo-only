import { formatKeyDriver, formatPattern, formatTechnicalFactor } from "@/lib/display-utils";

/** Replace em/en dashes that read as generic AI tone */
export function softenPunctuation(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ", ").replace(/\s*-\s*(?=[A-Za-z])/g, ", ");
}

export function neutralizeTradeWords(s: string): string {
  return s
    .replace(/\bHOLD\b/gi, "no clear edge for a new position")
    .replace(/\bBUY\b/gi, "long-leaning evidence")
    .replace(/\bSELL\b/gi, "short-leaning evidence")
    .replace(/\bhodl\b/gi, "holding")
    .trim();
}

function hashPick(seed: string, options: string[]): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return options[Math.abs(h) % options.length];
}

/** Turn leading imperatives into observational phrasing */
function softenImperativeOpening(s: string): string {
  const t = s.trim();
  if (/^wait for volume/i.test(t)) {
    return t.replace(/^wait for volume confirmation\.?/i, "Participation on the tape has not really confirmed the move yet");
  }
  if (/^wait for/i.test(t)) {
    return t.replace(/^wait for /i, "The setup still needs ");
  }
  return t;
}

/**
 * 3–4 short paragraphs, varied by symbol + drivers (not one repeated template).
 */
export function buildExpandedReasoning(input: {
  rationale?: string | null;
  positioningNotes?: string | null;
  keyDrivers?: string[];
  riskFlags?: string[];
  patterns?: string[];
  technicalFactors?: string[];
  convictionRationale?: string | null;
  bullishCase?: string | null;
  bearishCase?: string | null;
  contrarianView?: string | null;
  volumeProfile?: string | null;
  symbol?: string;
}): string {
  const sym = input.symbol?.trim() || "This symbol";
  const seed = `${sym}|${(input.keyDrivers ?? []).join(",")}|${(input.rationale ?? "").slice(0, 80)}`;

  const primaryRaw =
    input.convictionRationale?.trim() ||
    input.rationale?.trim() ||
    input.positioningNotes?.trim() ||
    "";

  const paras: string[] = [];

  if (primaryRaw) {
    let p = softenPunctuation(neutralizeTradeWords(softenImperativeOpening(primaryRaw)));
    if (!p.endsWith(".")) p += ".";
    if (!p.toLowerCase().includes("volume") && /volume|participation|thin/i.test(primaryRaw)) {
      p += " Thin participation usually means a swing can reverse faster than on a busy tape.";
    }
    paras.push(p);
  }

  const drivers = (input.keyDrivers ?? []).slice(0, 4).map((d) => formatKeyDriver(d));
  if (drivers.length) {
    const a = drivers.slice(0, 2).join(" and ");
    const b = drivers.length > 2 ? `; ${drivers.slice(2).join(", ")} also registered` : "";
    const driverLines = [
      `${sym}: the run leaned hardest on ${a}${b}. Those labels summarize what repeated across indicators, not one-off prints.`,
      `Across the pipeline for ${sym}, ${a}${b} left the most consistent footprint in the scoring stack.`,
      `For ${sym}, evidence clustered around ${a}${b}. That mix drove the narrative above, not a single spike.`,
    ];
    paras.push(hashPick(seed, driverLines));
  }

  const risks = (input.riskFlags ?? []).slice(0, 3).map((r) => formatKeyDriver(r));
  if (risks.length) {
    const line = hashPick(`${seed}|risk`, [
      `If anything snaps first, watch ${risks.join(" and ")}: those are the failure modes the model flagged.`,
      `Main fragility here is ${risks.join(" and ")}. When those flip, the story in the bullets usually ages fastest.`,
      `Cautions baked in: ${risks.join(", ")}. They matter more than the headline lean when conditions shift.`,
    ]);
    paras.push(line);
  }

  const tech = (input.technicalFactors ?? []).slice(0, 2).map((f) => formatTechnicalFactor(f));
  if (tech.length && paras.length < 3) {
    paras.push(`Rule-based patterns include ${tech.join(" and ")}. They are inputs, not triggers by themselves.`);
  }

  if (input.volumeProfile === "low" && paras.length < 4) {
    paras.push(`${sym} traded light versus its recent average, so conviction from size traders is still a question mark.`);
  } else if (input.volumeProfile === "high" && paras.length < 4) {
    paras.push(`Volume is elevated versus recent norms for ${sym}, so moves deserve attention, but still need your own risk frame.`);
  }

  if (paras.length < 3 && input.contrarianView?.trim()) {
    const c = softenPunctuation(neutralizeTradeWords(input.contrarianView.trim()));
    paras.push(c.length > 220 ? `${c.slice(0, 217)}...` : c);
  }

  if (paras.length < 2) {
    const pat = (input.patterns ?? []).slice(0, 3).map((p) => formatPattern(p));
    if (pat.length) {
      paras.push(
        `${sym} triggered ${pat.join(", ")} on this window. The paragraphs above tie those tags to how the ensemble read the tape.`,
      );
    }
  }

  if (paras.length === 0) {
    return `${sym}: this run returned little prose. Use Key Drivers, Risks, and Patterns below, then rerun after a full session or fresh headlines.`;
  }

  return paras.slice(0, 4).join("\n\n");
}
