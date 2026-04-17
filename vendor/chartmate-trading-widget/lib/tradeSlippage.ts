/**
 * Entry slippage: difference between reference quote at decision time and actual fill (entry_price).
 * Adverse for BUY = paid more than reference; adverse for SELL = received less than reference.
 */

export type TradeAction = "BUY" | "SELL" | "HOLD";

export function resolveReferenceEntryPrice(
  referenceEntryPrice: number | null | undefined,
  entryPrice: number,
): number {
  const ref = referenceEntryPrice;
  if (ref != null && Number.isFinite(ref) && ref > 0) return ref;
  return entryPrice;
}

export function computeEntrySlippage(
  action: TradeAction,
  referenceEntryPrice: number | null | undefined,
  entryPrice: number,
): {
  reference: number;
  fill: number;
  /** Signed: positive = adverse (worse fill for trader) */
  slipPerShare: number;
  slipPctOfReference: number;
  isAdverse: boolean;
  isZero: boolean;
} {
  const fill = Number(entryPrice);
  const reference = resolveReferenceEntryPrice(referenceEntryPrice, fill);
  if (!Number.isFinite(fill) || fill <= 0 || !Number.isFinite(reference) || reference <= 0) {
    return {
      reference: reference > 0 ? reference : Math.max(fill, 0),
      fill,
      slipPerShare: 0,
      slipPctOfReference: 0,
      isAdverse: false,
      isZero: true,
    };
  }

  const buy = action === "BUY" || action === "HOLD";
  const slipPerShare = buy ? fill - reference : reference - fill;
  const slipPctOfReference = (Math.abs(slipPerShare) / reference) * 100;
  const isZero = Math.abs(slipPerShare) < 1e-8 || Math.abs(slipPerShare / reference) < 1e-6;
  return {
    reference,
    fill,
    slipPerShare,
    slipPctOfReference,
    isAdverse: slipPerShare > 0 && !isZero,
    isZero,
  };
}

export function formatSlippageLine(
  action: TradeAction,
  referenceEntryPrice: number | null | undefined,
  entryPrice: number,
  formatMoney: (n: number) => string,
): string {
  const s = computeEntrySlippage(action, referenceEntryPrice, entryPrice);
  if (s.isZero) {
    return `Slippage: ${formatMoney(0)} (0.00%) — fill matches reference quote`;
  }
  const sign = s.slipPerShare >= 0 ? "+" : "";
  const adv = s.isAdverse ? " (adverse)" : " (favourable)";
  return `Slippage vs reference: ${sign}${formatMoney(s.slipPerShare)} (${sign}${s.slipPctOfReference.toFixed(2)}%)${adv}`;
}
