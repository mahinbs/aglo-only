import { useEffect, useRef, useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AFFILIATE_REF_KEY = "affiliate_ref";
const AFFILIATE_ID_KEY = "affiliate_id";
const COOKIE_EXPIRY_DAYS = 30;

function setCookie(name: string, value: string, days: number) {
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "; expires=" + date.toUTCString();
  document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
}

function getCookie(name: string) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function deleteCookie(name: string) {
  document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}

function getStoredRef(): string | null {
  return getCookie(AFFILIATE_REF_KEY);
}

function getStoredAffiliateId(): string | null {
  return getCookie(AFFILIATE_ID_KEY);
}

/** Session keys populated by the global ref capture in App — read at form submit / signup. */
export function getSessionAffiliateAttribution(): {
  affiliateId: string | null;
  referralCode: string | null;
} {
  return { affiliateId: getStoredAffiliateId(), referralCode: getStoredRef() };
}

function setStoredRef(ref: string | null): void {
  if (ref) setCookie(AFFILIATE_REF_KEY, ref, COOKIE_EXPIRY_DAYS);
  else deleteCookie(AFFILIATE_REF_KEY);
}

function setStoredAffiliateId(id: string | null): void {
  if (id) setCookie(AFFILIATE_ID_KEY, id, COOKIE_EXPIRY_DAYS);
  else deleteCookie(AFFILIATE_ID_KEY);
}

/**
 * Reads ?ref=CODE from URL, stores in cookies (30 days), and calls edge function to record visit with UTMs.
 * Returns current affiliate_id so forms/payments can attach it.
 */
export function useAffiliateRef() {
  const [searchParams, setSearchParams] = useSearchParams();
  const refFromUrl = searchParams.get("ref");
  
  // Capture UTMs
  const utms = {
    utm_source: searchParams.get("utm_source"),
    utm_medium: searchParams.get("utm_medium"),
    utm_campaign: searchParams.get("utm_campaign"),
    utm_term: searchParams.get("utm_term"),
    utm_content: searchParams.get("utm_content"),
  };

  const [affiliateId, setAffiliateId] = useState<string | null>(() => getStoredAffiliateId());
  const recordedRef = useRef<string | null>(null);
  const processingRef = useRef(false);

  const recordVisitAndResolveId = useCallback(async (code: string, utmData?: any) => {
    // Only skip if we already recorded THIS exact combination in this session
    const uniqueKey = `${code}-${JSON.stringify(utmData || {})}`;
    if (recordedRef.current === uniqueKey) return;
    
    try {
      await supabase.functions.invoke("record-affiliate-visit", { 
        body: { 
          ref: code,
          ...utmData,
          referrer: document.referrer || null
        } 
      });
      
      recordedRef.current = uniqueKey;
      
      const { data: rows } = await (supabase as any)
        .from("affiliates")
        .select("id")
        .eq("code", code)
        .eq("is_active", true)
        .limit(1);
        
      const id = rows?.[0]?.id ?? null;
      setAffiliateId(id);
      if (id) {
        setStoredAffiliateId(id);
      }
    } catch (e) {
      console.warn("Affiliate visit record failed:", e);
    }
  }, []);

  useEffect(() => {
    const code = refFromUrl?.trim() || null;
    
    if (code && !processingRef.current) {
      processingRef.current = true;
      
      // 1. Capture UTMs immediately
      const utmData: any = {};
      const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
      utmKeys.forEach(key => {
        const val = searchParams.get(key);
        if (val) utmData[key] = val;
      });

      // 2. Store the ref code
      setStoredRef(code);
      
      // 3. Record the visit with UTMs
      recordVisitAndResolveId(code, Object.keys(utmData).length > 0 ? utmData : undefined);
      
      // 4. Clean up URL
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("ref");
      // We keep UTMs in searchParams state but remove from browser bar to keep UI clean
      const newSearch = newParams.toString();
      const newPath = window.location.pathname + (newSearch ? `?${newSearch}` : "");
      window.history.replaceState({}, "", newPath);
      
      // Sync React Router state
      setSearchParams(newParams, { replace: true });
      
      setTimeout(() => { processingRef.current = false; }, 1000);
    } else if (!code && !affiliateId) {
      // Handle returning visitor (no ?ref= in URL)
      const stored = getStoredRef();
      if (stored) {
        const storedId = getStoredAffiliateId();
        if (storedId) {
          setAffiliateId(storedId);
        } else {
          recordVisitAndResolveId(stored);
        }
      }
    }
  }, [refFromUrl, recordVisitAndResolveId, setSearchParams, searchParams, affiliateId]);

  const clearRef = useCallback(() => {
    setStoredRef(null);
    setStoredAffiliateId(null);
    setAffiliateId(null);
    recordedRef.current = null;
  }, []);

  const storedRefCode = getStoredRef();

  return { affiliateId, clearRef, storedRefCode };
}
