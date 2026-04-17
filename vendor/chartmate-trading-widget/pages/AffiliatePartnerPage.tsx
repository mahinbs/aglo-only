import React, { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { motion, Variants } from "framer-motion";
import AiPredictionHeader from "@/components/landingpage/mainlandingpage/AiPredictionHeader";
import AiPredictionFooter from "@/components/landingpage/mainlandingpage/AiPredictionFooter";
import abstractDataBg from "@/assets/abstract_data_bg.png";
import affiliateHeroBg from "@/assets/affiliate_hero_bg.png";
import {
  FaArrowRight,
  FaChartLine,
  FaCheck,
  FaCheckCircle,
  FaHandshake,
  FaLink,
  FaMoneyBillWave,
  FaUsers,
} from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const PRODUCT_PRICE_USD = 49;
const COMMISSION_RATE = 0.3;

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function AffiliateCalculatorSlider({
  id,
  label,
  value,
  onChange,
  step,
  min,
  max,
  decimals = 0,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
  min: number;
  max: number;
  decimals?: number;
}) {
  const clampFix = (n: number) => {
    const clamped = Math.min(max, Math.max(min, n));
    return decimals > 0
      ? Math.round(clamped * 10 ** decimals) / 10 ** decimals
      : Math.round(clamped);
  };

  const safe = Number.isFinite(value) ? clampFix(value) : min;

  const display =
    decimals > 0 ? `${safe.toFixed(decimals)}%` : safe.toLocaleString("en-US");

  /** Visible track + draggable thumb (no left-to-right “fill” bar). */
  const rangeClass = cn(
    "h-12 w-full cursor-grab touch-manipulation bg-transparent active:cursor-grabbing",
    "appearance-none focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-lg",
    /* WebKit track */
    "[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-zinc-700",
    /* WebKit thumb — pointer knob */
    "[&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none",
    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-teal-400",
    "[&::-webkit-slider-thumb]:shadow-[0_2px_12px_rgba(45,212,191,0.45)]",
    /* Firefox track + thumb */
    "[&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-zinc-700",
    "[&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white",
    "[&::-moz-range-thumb]:bg-teal-400 [&::-moz-range-thumb]:shadow-[0_2px_12px_rgba(45,212,191,0.45)] [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:border-solid"
  );

  return (
    <div className="space-y-3 w-full">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Label htmlFor={id} className="text-zinc-400">
          {label}
        </Label>
        <span className="tabular-nums text-lg font-semibold text-teal-400" aria-live="polite">
          {display}
        </span>
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 pt-3 pb-1 focus-within:border-teal-500/50 focus-within:ring-2 focus-within:ring-teal-500/25">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={safe}
          onChange={(e) => onChange(clampFix(Number(e.target.value)))}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={safe}
          aria-valuetext={display}
          className={rangeClass}
        />
      </div>
    </div>
  );
}

const AffiliatePartnerPage = () => {
  const [squares, setSquares] = useState<{ top: number; left: number }[]>([]);
  const [audienceSize, setAudienceSize] = useState(100);
  const [conversionPct, setConversionPct] = useState(2);

  useEffect(() => {
    const generateSquares = () => {
      const newSquares = [];
      for (let i = 0; i < 6; i++) {
        newSquares.push({
          top: Math.floor(Math.random() * 80) + 10,
          left: Math.floor(Math.random() * 90) + 5,
        });
      }
      setSquares(newSquares);
    };
    generateSquares();
    const interval = setInterval(generateSquares, 3000);
    return () => clearInterval(interval);
  }, []);

  const { monthlyRev, yearlyRev } = useMemo(() => {
    const a = Number.isFinite(audienceSize) && audienceSize >= 0 ? audienceSize : 0;
    const c = Number.isFinite(conversionPct) && conversionPct >= 0 ? conversionPct : 0;
    const signups = a * (c / 100);
    const monthly = Math.round(signups * PRODUCT_PRICE_USD * COMMISSION_RATE);
    return { monthlyRev: monthly, yearlyRev: monthly * 12 };
  }, [audienceSize, conversionPct]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-teal-500/30 selection:text-teal-100 overflow-x-hidden">
      <Helmet>
        <title>Affiliate partner program | TradingSmart.ai</title>
        <meta
          name="description"
          content="Earn commissions promoting a full trading stack: analysis, backtests, strategies, options, paper/live execution, and custom algo integration. Built for retention—not hype."
        />
      </Helmet>

      <AiPredictionHeader />

      {/* Hero */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center pt-32 pb-20 px-4 overflow-hidden bg-black border-b border-zinc-900">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30 pointer-events-none mix-blend-screen"
          style={{ backgroundImage: `url(${affiliateHeroBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black z-0 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-transparent via-black/80 to-black z-0 pointer-events-none" />

        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: `
            linear-gradient(to right, rgba(20,184,166,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(20,184,166,0.03) 1px, transparent 1px)
          `,
            backgroundSize: "60px 60px",
          }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[100px] animate-pulse" />
          {squares.map((pos, index) => (
            <div
              key={`square-${index}`}
              className="absolute w-[60px] h-[60px] bg-teal-500/5 transition-all duration-1000 ease-in-out backdrop-blur-sm"
              style={{ top: `${pos.top}%`, left: `${pos.left}%` }}
            />
          ))}
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="container mx-auto z-20 text-center relative max-w-6xl"
        >
          <motion.div
            variants={fadeUp}
            className="inline-flex flex-wrap items-center justify-center gap-2 px-5 py-2 rounded-full border border-teal-500/20 bg-teal-500/5 backdrop-blur-md mb-8 shadow-[0_0_20px_rgba(20,184,166,0.1)]"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500" />
            </span>
            <span className="text-sm font-semibold text-teal-300 tracking-wide uppercase">
              AI trading business opportunity
            </span>
            <span className="text-zinc-500 hidden sm:inline">·</span>
            <span className="text-xs text-zinc-400">Not a mass-market “affiliate program”</span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight mb-8 leading-[1.08] text-white"
          >
            Turn Your Trading Audience into a{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-300">
              Recurring Revenue Engine
            </span>
          </motion.h1>

          <motion.div
            variants={fadeUp}
            className="text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto mb-8 font-light leading-relaxed space-y-4 text-left sm:text-center"
          >
            <p className="text-zinc-300 font-medium">Not another affiliate program.</p>
            <p>
              This is your chance to build a <strong className="text-zinc-200">trading product business</strong>{" "}
              without building the tech.
            </p>
            <p>
              With TradingSmart.ai, you&apos;re not just referring users—you&apos;re monetizing your audience with a{" "}
              <strong className="text-zinc-200">high-retention AI product</strong> traders actually use daily.
            </p>
          </motion.div>

          <motion.p
            variants={fadeUp}
            className="text-teal-400/90 text-sm md:text-base font-medium mb-10"
          >
            Limited partner slots available
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link to="/auth">
              <Button className="bg-teal-500 hover:bg-teal-400 text-black font-bold text-lg px-10 py-7 rounded-full shadow-[0_0_40px_rgba(20,184,166,0.3)] hover:shadow-[0_0_60px_rgba(20,184,166,0.5)] transition-all duration-300 hover:scale-[1.02] active:scale-95">
                Apply for Exclusive Access
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* Stats strip */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="py-12 bg-zinc-950 border-b border-zinc-900"
      >
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { label: "Your share", value: "Up to 30%", color: "text-emerald-400" },
              { label: "Cookie window", value: "90 days", color: "text-teal-400" },
              { label: "Payouts", value: "Monthly", color: "text-blue-400" },
              { label: "Product", value: "Daily-use AI", color: "text-purple-400" },
            ].map((stat, i) => (
              <motion.div
                variants={fadeUp}
                key={i}
                className="p-6 bg-black border border-zinc-800 rounded-3xl text-center hover:border-zinc-700 transition-colors shadow-lg"
              >
                <div className={`text-2xl md:text-3xl font-black ${stat.color} mb-2`}>{stat.value}</div>
                <div className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>+

      
      {/* Revenue calculator */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="py-20 bg-black border-b border-zinc-900"
      >
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-black text-white text-center mb-2">
            Estimate your earnings
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-500 text-center text-sm mb-10">
            Simple scenario—adjust numbers to match your reach.
          </motion.p>
          <motion.div
            variants={fadeUp}
            className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-8 space-y-6"
          >
            <div className="flex md:flex-row flex-col gap-10 w-full">
            <AffiliateCalculatorSlider
              id="aff-audience"
              label="Monthly visitors / audience size"
              value={audienceSize}
              onChange={setAudienceSize}
              step={50}
              min={0}
              max={200_000}              
            />
            <AffiliateCalculatorSlider
              id="aff-conv"
              label="Conversion rate (%)"
              value={conversionPct}
              onChange={setConversionPct}
              step={0.1}
              min={0}
              max={100}
              decimals={1}
            />
            </div>
            <div className="flex justify-between text-sm text-zinc-500 pt-2 border-t border-zinc-800">
              <span>Product price</span>
              <span className="text-zinc-200 font-medium">${PRODUCT_PRICE_USD}/yr</span>
            </div>
            <div className="flex justify-between text-sm text-zinc-500">
              <span>Your commission</span>
              <span className="text-emerald-400 font-medium">30%</span>
            </div>
            <div className="rounded-2xl bg-teal-500/10 border border-teal-500/20 p-6 space-y-3">
              <div className="flex justify-between items-baseline gap-4">
                <span className="text-zinc-400 text-sm">Estimated monthly revenue</span>
                <span className="text-2xl font-black text-teal-400 tabular-nums">{formatUsd(monthlyRev)}</span>
              </div>
              <div className="flex justify-between items-baseline gap-4">
                <span className="text-zinc-400 text-sm">Estimated yearly revenue</span>
                <span className="text-xl font-bold text-white tabular-nums">{formatUsd(yearlyRev)}</span>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Income angle */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="py-20 bg-black border-b border-zinc-900"
      >
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.h2 variants={fadeUp} className="text-3xl md:text-5xl font-black text-white text-center mb-4">
            What does this actually look like?
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-500 text-center mb-12 text-lg">
            A simple math story—then scale it with your channels.
          </motion.p>
          <motion.div
            variants={fadeUp}
            className="rounded-3xl border border-teal-500/20 bg-teal-500/[0.06] p-8 md:p-10 space-y-6"
          >
            <ul className="space-y-3 text-lg text-zinc-300">
              <li>You refer <strong className="text-white">50 users</strong></li>
              <li>
                Each pays <strong className="text-white">${PRODUCT_PRICE_USD}/year</strong>
              </li>
              <li>
                You earn up to <strong className="text-emerald-400">30%</strong>
              </li>
            </ul>
            <p className="text-xl text-white font-semibold border-t border-teal-500/20 pt-6">
              That&apos;s recurring income from a single piece of content—then scale with YouTube, Telegram groups, and
              trading communities into a <span className="text-teal-400">predictable monthly revenue stream</span>.
            </p>
          </motion.div>
        </div>
      </motion.section>

      {/* Why this converts */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="py-20 bg-zinc-950 relative border-b border-zinc-900"
      >
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black mb-4 text-white tracking-tight">
              Why TradingSmart.ai is easy to sell
            </h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
              Built for retention, clarity, and conversion—so you don&apos;t have to hard-sell.
            </p>
          </motion.div>
          <div className="grid sm:grid-cols-2 gap-6 md:gap-8">
            {[
              {
                title: "Solves a real pain",
                body: "Traders need structure: analysis, backtests, and a path to automation. We bundle the full platform with engineering-led custom algo integration.",
                icon: <FaChartLine />,
              },
              {
                title: "Daily-use product",
                body: "Not a one-time tool—users come back every day. Higher retention means more commissions over time.",
                icon: <FaUsers />,
              },
              {
                title: "Built for monetization",
                body: "UI and pricing are tuned for conversions. You spend less energy “convincing” and more building trust.",
                icon: <FaMoneyBillWave />,
              },
              {
                title: "Position as authority",
                body: "Recommend a premium AI tool your audience can rely on—instant credibility with serious traders.",
                icon: <FaHandshake />,
              },
            ].map((item, i) => (
              <motion.div
                variants={fadeUp}
                key={i}
                className="bg-black p-8 rounded-3xl border border-zinc-800 hover:border-teal-500/30 transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center text-2xl mb-6">
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                <p className="text-zinc-400 leading-relaxed">{item.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Distribution partner */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="py-20 bg-black border-b border-zinc-900"
      >
        <div className="container mx-auto px-4 max-w-5xl">
          <motion.h2 variants={fadeUp} className="text-3xl md:text-5xl font-black text-white text-center mb-4">
            You&apos;re not an affiliate. You&apos;re a distribution partner.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-500 text-center mb-14 max-w-2xl mx-auto">
            Split the work like a real business—not a link farm.
          </motion.p>
          <div className="grid md:grid-cols-2 gap-8">
            <motion.div
              variants={fadeUp}
              className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-8 md:p-10"
            >
              <h3 className="text-teal-400 font-bold uppercase tracking-widest text-sm mb-6">You bring</h3>
              <ul className="space-y-4 text-zinc-300 text-lg">
                <li className="flex items-center gap-3">
                  <FaCheckCircle className="text-teal-500 shrink-0" /> Audience
                </li>
                <li className="flex items-center gap-3">
                  <FaCheckCircle className="text-teal-500 shrink-0" /> Trust
                </li>
                <li className="flex items-center gap-3">
                  <FaCheckCircle className="text-teal-500 shrink-0" /> Traffic
                </li>
              </ul>
            </motion.div>
            <motion.div
              variants={fadeUp}
              className="rounded-3xl border border-teal-500/25 bg-teal-500/[0.04] p-8 md:p-10"
            >
              <h3 className="text-emerald-400 font-bold uppercase tracking-widest text-sm mb-6">We handle</h3>
              <ul className="space-y-4 text-zinc-300 text-lg">
                <li className="flex items-center gap-3">
                  <FaCheckCircle className="text-emerald-500 shrink-0" /> Product
                </li>
                <li className="flex items-center gap-3">
                  <FaCheckCircle className="text-emerald-500 shrink-0" /> Tech &amp; AI infrastructure
                </li>
                <li className="flex items-center gap-3">
                  <FaCheckCircle className="text-emerald-500 shrink-0" /> Continuous improvements
                </li>
              </ul>
            </motion.div>
          </div>
          <motion.p variants={fadeUp} className="text-center text-zinc-400 mt-10 text-lg">
            <span className="text-teal-400 font-semibold">You focus on growth.</span>{" "}
            <span className="text-zinc-300">We handle everything else.</span>
          </motion.p>
        </div>
      </motion.section>

      {/* Exclusivity */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="py-20 bg-zinc-950 border-b border-zinc-900"
      >
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <motion.h2 variants={fadeUp} className="text-3xl md:text-5xl font-black text-white mb-6">
            We are not onboarding everyone
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-400 text-lg mb-10">
            We&apos;re selectively partnering with people who already have reach and reputation in trading.
          </motion.p>
          <motion.ul variants={fadeUp} className="text-left inline-block space-y-3 text-zinc-300 text-lg mb-10">
            {["Trading mentors", "Content creators", "Community builders", "Serious traders with a network"].map(
              (t) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                  {t}
                </li>
              ),
            )}
          </motion.ul>
          <motion.p variants={fadeUp} className="text-zinc-500">
            Why? We want <strong className="text-zinc-300">quality partners</strong>, not mass affiliates.
          </motion.p>
        </div>
      </motion.section>

      {/* How it works */}
      <motion.section
        id="how-it-works"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="py-20 bg-black border-b border-zinc-900"
      >
        <div className="container mx-auto px-4 max-w-5xl">
          <motion.div variants={fadeUp} className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black mb-4 text-white tracking-tight">How it works</h2>
          </motion.div>
          <div className="relative">
            <div className="hidden md:block absolute top-12 left-0 w-full h-px bg-gradient-to-r from-transparent via-teal-900 to-transparent z-0" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
              {[
                {
                  step: "1",
                  title: "Get your access",
                  desc: "Instant dashboard, tracking links, and creatives—ready to share.",
                  icon: <FaLink />,
                },
                {
                  step: "2",
                  title: "Plug into your content",
                  desc: "YouTube, Telegram, Instagram, Discord, email—wherever your audience already is.",
                  icon: <FaUsers />,
                },
                {
                  step: "3",
                  title: "Build recurring revenue",
                  desc: "Earn as your users stay active on a product they use regularly.",
                  icon: <FaMoneyBillWave />,
                },
              ].map((item, i) => (
                <motion.div variants={fadeUp} key={i} className="flex flex-col items-center text-center group">
                  <div className="w-24 h-24 rounded-full bg-black border border-zinc-800 flex flex-col items-center justify-center mb-8 relative z-10 group-hover:border-teal-500 shadow-lg transition-colors">
                    <span className="text-teal-500 text-sm font-bold absolute top-2">{item.step}</span>
                    <div className="text-3xl text-zinc-300 mt-3 group-hover:text-teal-400 transition-colors">
                      {item.icon}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-4">{item.title}</h3>
                  <p className="text-zinc-400 leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Why people actually buy */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="py-20 bg-zinc-950 border-b border-zinc-900"
      >
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-black text-white text-center mb-4">
            Why people actually buy
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-500 text-center mb-10">
            Affiliates sell better when they understand buyer psychology.
          </motion.p>
          <motion.div variants={fadeUp} className="rounded-3xl border border-zinc-800 bg-black/60 p-8 space-y-6">
            {[
              { q: "“How do I validate my rules?”", a: "→ Analysis + backtests." },
              { q: "“Can I automate without coding?”", a: "→ Custom integration." },
              { q: "“Options and live execution?”", a: "→ Same dashboard." },
            ].map((row) => (
              <div
                key={row.q}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800/80 pb-5 last:border-0 last:pb-0"
              >
                <span className="text-zinc-200 font-medium">{row.q}</span>
                <span className="text-teal-400 font-semibold">{row.a}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </motion.section>


      {/* Strong CTA */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={staggerContainer}
        className="py-24 relative overflow-hidden flex items-center justify-center bg-black border-t border-zinc-900"
      >
        <div className="absolute inset-0 z-0">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20 mix-blend-screen pointer-events-none"
            style={{ backgroundImage: `url(${abstractDataBg})` }}
          />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-teal-600/10 rounded-full blur-[120px]" />
        </div>

        <div className="container mx-auto px-4 relative z-10 text-center max-w-2xl">
          <motion.h2 variants={fadeUp} className="text-3xl md:text-5xl font-black mb-6 text-white tracking-tight">
            This is not for everyone
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-400 text-lg mb-8">
            If you just want to &quot;try affiliate marketing,&quot; this isn&apos;t for you.
          </motion.p>
          <motion.p variants={fadeUp} className="text-zinc-300 text-lg mb-8">
            If you want to:
          </motion.p>
          <motion.ul variants={fadeUp} className="text-left max-w-md mx-auto space-y-3 mb-12 text-zinc-300">
            {[
              "Build a real income stream",
              "Monetize your trading audience",
              "Leverage AI without building tech",
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <FaCheck className="text-teal-500 mt-1 shrink-0" />
                {line}
              </li>
            ))}
          </motion.ul>
          <motion.p variants={fadeUp} className="text-white font-semibold mb-10">
            Then apply.
          </motion.p>
          <motion.div variants={fadeUp}>
            <Link to="/auth">
              <Button className="bg-teal-500 text-black hover:bg-teal-400 text-lg px-12 py-7 rounded-full font-bold border border-teal-400/50 shadow-[0_0_40px_rgba(20,184,166,0.2)] hover:shadow-[0_0_60px_rgba(20,184,166,0.4)] transition-all duration-300 hover:scale-[1.02] active:scale-95 inline-flex items-center gap-3">
                Apply for Partner Access <FaArrowRight />
              </Button>
            </Link>
          </motion.div>
          <motion.p variants={fadeUp} className="mt-12 text-sm text-zinc-600">
            Positioning: <span className="line-through text-zinc-500">Affiliate program</span>{" "}
            <span className="text-zinc-400">→</span>{" "}
            <span className="text-teal-500/90">AI trading business opportunity</span>
          </motion.p>
        </div>
      </motion.section>

      <AiPredictionFooter />
    </div>
  );
};

export default AffiliatePartnerPage;
