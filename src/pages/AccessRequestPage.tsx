import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import "@/styles/onboarding-access.css";

const STEP_NAMES = [
  "Personal Info",
  "KYC",
  "Trading Profile",
  "Broker & API",
  // "Strategy Setup",
  "Risk & Consent",
  "Review & Submit",
];

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  idType: string;
  idNumber: string;
  address1: string;
  address2: string;
  capital: string;
  currency: string;
  risk: string;
  experience: string;
  markets: string[];
  broker: string;
  clientId: string;
  strategy: string;
  riskPerTrade: string;
  maxDailyLoss: string;
  mode: string;
  c1: boolean;
  c2: boolean;
  c3: boolean;
  c4: boolean;
  finalConfirm: boolean;
};

const initialForm: FormState = {
  fullName: "",
  email: "",
  phone: "",
  country: "",
  city: "",
  idType: "",
  idNumber: "",
  address1: "",
  address2: "",
  capital: "",
  currency: "INR",
  risk: "",
  experience: "",
  markets: [],
  broker: "",
  clientId: "",
  strategy: "",
  riskPerTrade: "2",
  maxDailyLoss: "5",
  mode: "",
  c1: false,
  c2: false,
  c3: false,
  c4: false,
  finalConfirm: false,
};

export default function AccessRequestPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const pct = useMemo(() => Math.round((step / STEP_NAMES.length) * 100), [step]);

  const next = () => {
    setErr(null);
    if (step === 1) {
      if (!form.fullName.trim() || !form.email.trim() || !form.phone.trim()) {
        setErr("Please fill name, email, and phone.");
        return;
      }
    }
    if (step < STEP_NAMES.length) setStep((s) => s + 1);
  };

  const prev = () => {
    setErr(null);
    if (step > 1) setStep((s) => s - 1);
  };

  const submit = async () => {
    if (!form.finalConfirm || !form.c1 || !form.c2 || !form.c3 || !form.c4) {
      setErr("Please accept all disclosures and confirm your details.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        kyc: {
          idType: form.idType,
          idNumber: form.idNumber,
          address1: form.address1,
          address2: form.address2,
        },
        tradingProfile: {
          capital: form.capital,
          currency: form.currency,
          risk: form.risk,
          experience: form.experience,
          markets: form.markets,
        },
        broker: {
          broker: form.broker,
          clientId: form.clientId,
        },
        strategy: {
          strategy: form.strategy,
          riskPerTrade: form.riskPerTrade,
          maxDailyLoss: form.maxDailyLoss,
          mode: form.mode,
        },
        consent: { c1: form.c1, c2: form.c2, c3: form.c3, c4: form.c4 },
      };
      const { error } = await supabase.functions.invoke("submit-algo-access-request", {
        body: {
          full_name: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          country: form.country.trim() || null,
          city: form.city.trim() || null,
          payload,
        },
      });
      if (error) throw new Error(error.message);
      setDone(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleMarket = (m: string) => {
    setForm((f) => ({
      ...f,
      markets: f.markets.includes(m) ? f.markets.filter((x) => x !== m) : [...f.markets, m],
    }));
  };

  if (done) {
    return (
      <div className="onboard-access-scope">
        <div className="bg-grid" />
        <div className="bg-orbs">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
        </div>
        <div className="scanlines" />
        <div className="onboard-wrapper">
          <div className="success-screen active">
            <div className="success-icon">&#x1F680;</div>
            <div className="success-title">APPLICATION SUBMITTED</div>
            <div className="success-text">
              Our team will review your request. If approved, you will receive ChartMate / TradingSmart access instructions by email.
            </div>
            <Link to="/login" className="success-btn">
              &#x2190; Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onboard-access-scope">
      <div className="bg-grid" />
      <div className="bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>
      <div className="scanlines" />
      <div className="onboard-wrapper">
        <div className="onboard-header">
          <Link to="/login" className="onboard-logo">
            <div className="onboard-logo-icon">&#x1F916;</div> TRADINGSMART.AI
          </Link>
          <Link to="/login" className="onboard-back">
            &#x2190; Back to Login
          </Link>
        </div>

        <div className="progress-header">
          <div className="progress-info">
            <span className="progress-step-text">
              Step {step} of {STEP_NAMES.length}
            </span>
            <span className="progress-pct">{pct}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="progress-dots">
            {STEP_NAMES.map((name, i) => {
              const n = i + 1;
              const cls = n < step ? "done" : n === step ? "active" : "";
              return (
                <div key={name} className={`progress-dot ${cls}`}>
                  <div className="progress-dot-circle">{n < step ? "\u2713" : n}</div>
                  <div className="progress-dot-label">{name}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="onboard-body">
          <div className="onboard-card">
            {err && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "rgba(244,63,94,0.1)",
                  border: "1px solid rgba(244,63,94,0.2)",
                  color: "#f43f5e",
                  fontSize: 12,
                }}
              >
                {err}
              </div>
            )}

            {step === 1 && (
              <div className="step active">
                <div className="step-title">Personal Information</div>
                <div className="step-subtitle">Let&apos;s start with your basic details</div>
                <div className="section-label">&#x1F464; Basic Details</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Full Name <span className="req">*</span></label>
                    <input className="form-input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="John Doe" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email <span className="req">*</span></label>
                    <input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="trader@example.com" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone <span className="req">*</span></label>
                    <input className="form-input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 9876543210" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Country</label>
                    <select className="form-select" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                      <option value="">Select Country</option>
                      <option>India</option>
                      <option>United States</option>
                      <option>United Kingdom</option>
                      <option>Singapore</option>
                      <option>UAE</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <input className="form-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Mumbai" />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="step active">
                <div className="step-title">KYC &amp; Verification</div>
                <div className="step-subtitle">Identity details (documents verified manually by our team)</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">ID Type <span className="req">*</span></label>
                    <select className="form-select" value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })}>
                      <option value="">Select</option>
                      <option>PAN Card</option>
                      <option>Passport</option>
                      <option>Aadhaar</option>
                      <option>Driver&apos;s License</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">ID Number <span className="req">*</span></label>
                    <input className="form-input" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} />
                  </div>
                  <div className="form-group full">
                    <label className="form-label">Address</label>
                    <input className="form-input" value={form.address1} onChange={(e) => setForm({ ...form, address1: e.target.value })} placeholder="Street" />
                  </div>
                  <div className="form-group full">
                    <input className="form-input" value={form.address2} onChange={(e) => setForm({ ...form, address2: e.target.value })} placeholder="Apt, suite…" />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="step active">
                <div className="step-title">Trading Profile</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Capital</label>
                    <input className="form-input" type="number" value={form.capital} onChange={(e) => setForm({ ...form, capital: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Currency</label>
                    <select className="form-select" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                      <option>INR</option>
                      <option>USD</option>
                    </select>
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: 14 }}>
                  <label className="form-label">Risk appetite</label>
                  <div className="radio-group">
                    {["Low", "Medium", "High"].map((r) => (
                      <label key={r} className={`radio-option ${form.risk === r ? "selected" : ""}`}>
                        <input type="radio" name="risk" checked={form.risk === r} onChange={() => setForm({ ...form, risk: r })} />
                        {r}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="section-label">Markets</div>
                <div className="checkbox-group">
                  {["Equity", "Options", "Futures", "Crypto"].map((m) => (
                    <label key={m} className={`checkbox-option ${form.markets.includes(m) ? "selected" : ""}`}>
                      <input type="checkbox" checked={form.markets.includes(m)} onChange={() => toggleMarket(m)} />
                      {m}
                    </label>
                  ))}
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Experience</label>
                  <select className="form-select" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })}>
                    <option value="">Select</option>
                    <option>Beginner</option>
                    <option>Intermediate</option>
                    <option>Advanced</option>
                  </select>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="step active">
                <div className="step-title">Broker &amp; API</div>
                <p className="step-subtitle">Intent only — you will connect the live broker after we provision ChartMate access.</p>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Preferred broker</label>
                    <select className="form-select" value={form.broker} onChange={(e) => setForm({ ...form, broker: e.target.value })}>
                      <option value="">Select</option>
                      <option>Zerodha</option>
                      <option>Upstox</option>
                      <option>Angel One</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Client ID (optional)</label>
                    <input className="form-input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {/* {step === 5 && (
              <div className="step active">
                <div className="step-title">Strategy setup</div>
                <div className="form-group">
                  <label className="form-label">Strategy type</label>
                  <select className="form-select" value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })}>
                    <option value="">Select</option>
                    <option>Trend Following</option>
                    <option>Mean Reversion</option>
                    <option>Options</option>
                    <option>Scalping</option>
                  </select>
                </div>
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="form-group">
                    <div className="slider-group">
                      <div className="slider-header">
                        <label className="form-label">Risk / trade %</label>
                        <span className="slider-value">{form.riskPerTrade}%</span>
                      </div>
                      <input type="range" min="0.5" max="5" step="0.5" value={form.riskPerTrade} onChange={(e) => setForm({ ...form, riskPerTrade: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-group">
                    <div className="slider-group">
                      <div className="slider-header">
                        <label className="form-label">Max daily loss %</label>
                        <span className="slider-value">{form.maxDailyLoss}%</span>
                      </div>
                      <input type="range" min="1" max="10" step="0.5" value={form.maxDailyLoss} onChange={(e) => setForm({ ...form, maxDailyLoss: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="radio-group" style={{ marginTop: 16 }}>
                  {["Fully Automated", "Semi-Automated"].map((m) => (
                    <label key={m} className={`radio-option ${form.mode === m ? "selected" : ""}`}>
                      <input type="radio" name="mode" checked={form.mode === m} onChange={() => setForm({ ...form, mode: m })} />
                      {m}
                    </label>
                  ))}
                </div>
              </div>
            )} */}

            {step === 5 && (
              <div className="step active">
                <div className="step-title">Risk &amp; consent</div>
                <div className="consent-box">
                  <label className="consent-item">
                    <input type="checkbox" checked={form.c1} onChange={(e) => setForm({ ...form, c1: e.target.checked })} />
                    <span>I understand algorithmic trading involves substantial financial risk.</span>
                  </label>
                  <label className="consent-item">
                    <input type="checkbox" checked={form.c2} onChange={(e) => setForm({ ...form, c2: e.target.checked })} />
                    <span>I accept responsibility for losses from automated trading.</span>
                  </label>
                  <label className="consent-item">
                    <input type="checkbox" checked={form.c3} onChange={(e) => setForm({ ...form, c3: e.target.checked })} />
                    <span>I acknowledge no guaranteed returns.</span>
                  </label>
                  <label className="consent-item">
                    <input type="checkbox" checked={form.c4} onChange={(e) => setForm({ ...form, c4: e.target.checked })} />
                    <span>I authorize TradingSmart to execute automated orders once my broker is connected.</span>
                  </label>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="step active">
                <div className="step-title">Review &amp; submit</div>
                <div className="review-grid">
                  <div className="review-card">
                    <div className="review-card-title">Personal</div>
                    <div className="review-item"><span className="review-item-label">Name</span><span className="review-item-value">{form.fullName}</span></div>
                    <div className="review-item"><span className="review-item-label">Email</span><span className="review-item-value">{form.email}</span></div>
                    <div className="review-item"><span className="review-item-label">Phone</span><span className="review-item-value">{form.phone}</span></div>
                  </div>
                  <div className="review-card">
                    <div className="review-card-title">Trading</div>
                    <div className="review-item"><span className="review-item-label">Capital</span><span className="review-item-value">{form.currency} {form.capital}</span></div>
                    <div className="review-item"><span className="review-item-label">Risk</span><span className="review-item-value">{form.risk || "—"}</span></div>
                    <div className="review-item"><span className="review-item-label">Broker</span><span className="review-item-value">{form.broker || "—"}</span></div>
                  </div>
                </div>
                <label className="checkbox-option selected" style={{ marginTop: 16 }}>
                  <input type="checkbox" checked={form.finalConfirm} onChange={(e) => setForm({ ...form, finalConfirm: e.target.checked })} />
                  I confirm the details are correct
                </label>
              </div>
            )}

            <div className="btn-row">
              {step > 1 && (
                <button type="button" className="btn btn-back" onClick={prev}>
                  &#x2190; Back
                </button>
              )}
              {step < STEP_NAMES.length ? (
                <button type="button" className="btn btn-next" onClick={next}>
                  Next &#x2192;
                </button>
              ) : (
                <button type="button" className="btn btn-submit" disabled={busy} onClick={() => void submit()}>
                  {busy ? "Submitting…" : "Submit application"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
