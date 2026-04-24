const BROKER_NOT_CONFIGURED_MSG = "Broker is not configured yet. Contact your admin.";
const BROKER_CONNECT_FAILED_MSG = "Unable to connect broker right now. Please try again.";
const GENERIC_APP_ERROR_MSG = "Something went wrong. Please try again.";

function normalizedText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim();
}

export function toUserFacingErrorMessage(input: unknown, fallback = GENERIC_APP_ERROR_MSG): string {
  const raw = normalizedText(input);
  if (!raw) return fallback;
  const lower = raw.toLowerCase();

  if (
    lower.includes("broker is not configured") ||
    lower.includes("not configured yet") ||
    lower.includes("contact your admin")
  ) {
    return BROKER_NOT_CONFIGURED_MSG;
  }

  if (
    lower.includes("openalgo") ||
    lower.includes("api key") ||
    lower.includes("api secret") ||
    lower.includes("internal server error") ||
    lower.includes("server error") ||
    lower.includes("500")
  ) {
    return BROKER_CONNECT_FAILED_MSG;
  }

  if (
    lower.includes("vapt_algo_only_bff_url") ||
    lower.includes("env") ||
    lower.includes(".env")
  ) {
    return BROKER_CONNECT_FAILED_MSG;
  }

  return raw;
}

export function brokerNotConfiguredMessage(): string {
  return BROKER_NOT_CONFIGURED_MSG;
}
