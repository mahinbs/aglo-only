import type { CountryCode } from "libphonenumber-js";
import { getCountries, getCountryCallingCode } from "libphonenumber-js/max";

export type CountryDialOption = {
  iso: CountryCode;
  /** E.g. "+91" — from libphonenumber for this ISO. */
  dial: string;
  /** English region name for display in the dropdown (e.g. "India"). */
  countryName: string;
  /** Tokens for combobox search (dial, iso, country name). */
  searchValue: string;
};

let cache: CountryDialOption[] | null = null;

/**
 * One row per supported country (ISO). Dial codes match libphonenumber; shared codes (+1, +44, …)
 * appear on every country that uses them so users pick the right region.
 */
export function getCountryDialOptions(): CountryDialOption[] {
  if (cache) return cache;
  const dn = new Intl.DisplayNames(["en"], { type: "region" });
  const sortedIsos = [...getCountries()].sort();
  let rows: CountryDialOption[] = sortedIsos.map((iso) => {
    const dial = `+${getCountryCallingCode(iso)}`;
    const countryName = dn.of(iso) ?? String(iso);
    const nameLower = countryName.toLowerCase();
    const isoLower = String(iso).toLowerCase();
    const dialDigits = dial.replace(/\D/g, "");
    const searchValue = `${dial} ${dialDigits} ${isoLower} ${nameLower}`;
    return { iso, dial, countryName, searchValue };
  });
  rows.sort((a, b) => {
    if (a.iso === "IN") return -1;
    if (b.iso === "IN") return 1;
    const da = Number(a.dial.replace(/\D/g, "")) || 0;
    const db = Number(b.dial.replace(/\D/g, "")) || 0;
    if (da !== db) return da - db;
    return a.countryName.localeCompare(b.countryName, "en");
  });
  cache = rows;
  return cache;
}

export function buildE164FromNational(
  iso: CountryCode | string,
  nationalDigits: string,
): string {
  const digits = nationalDigits.replace(/\D/g, "");
  if (!digits) return "";
  try {
    const cc = getCountryCallingCode(iso as CountryCode);
    return `+${cc}${digits}`;
  } catch {
    return "";
  }
}

export const DEFAULT_SIGNUP_PHONE_ISO: CountryCode = "IN";
