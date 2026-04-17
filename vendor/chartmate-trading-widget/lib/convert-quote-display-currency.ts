export type FiatDisplay = "INR" | "USD";

/**
 * Convert a value from the asset's quote currency into the user's display currency.
 * @param usdPerInr USD per 1 INR (from Frankfurter base INR → USD).
 */
export function convertQuoteToDisplayAmount(
  amountInQuoteCurrency: number,
  quoteInUsd: boolean,
  displayCurrency: FiatDisplay,
  usdPerInr: number | null,
): number {
  const wantUsd = displayCurrency === "USD";
  if (quoteInUsd === wantUsd) return amountInQuoteCurrency;
  if (usdPerInr == null || usdPerInr <= 0) return amountInQuoteCurrency;
  if (wantUsd) return amountInQuoteCurrency * usdPerInr;
  return amountInQuoteCurrency / usdPerInr;
}

/**
 * Convert a number the user entered in `displayCurrency` into the asset's quote currency
 * (e.g. for APIs that expect INR notional on NSE).
 */
export function convertDisplayInputToQuoteAmount(
  amountInDisplayCurrency: number,
  quoteInUsd: boolean,
  displayCurrency: FiatDisplay,
  usdPerInr: number | null,
): number {
  const enteredUsd = displayCurrency === "USD";
  if (quoteInUsd === enteredUsd) return amountInDisplayCurrency;
  if (usdPerInr == null || usdPerInr <= 0) return amountInDisplayCurrency;
  if (enteredUsd && !quoteInUsd) return amountInDisplayCurrency / usdPerInr;
  return amountInDisplayCurrency * usdPerInr;
}
