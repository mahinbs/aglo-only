import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { Helmet } from "react-helmet-async";
import { useNavigate, Link } from "react-router-dom";
import { getSessionAffiliateAttribution } from "@/hooks/useAffiliateRef";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useMyTenantMembership } from "@/hooks/useWhitelabel";
import { supabase } from "@/integrations/supabase/client";
import { motion, Variants } from "framer-motion";
import heroBg from "@/assets/premium_hero_bg.png";

import { FaCheckCircle } from "react-icons/fa";
import { Shield, Eye, Pause, Lock } from "lucide-react";
import { Button } from "../components/ui/button";
import Hero3DCanvas from "../components/landingpage/mainlandingpage/Hero3DCanvas";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const DiamondIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-teal-500 shrink-0 mt-1 diamond-icon">
    <path d="M12 2L2 12L12 22L22 12L12 2Z" />
  </svg>
);
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import AiPredictionHeader from "../components/landingpage/mainlandingpage/AiPredictionHeader";
import AiPredictionFooter from "../components/landingpage/mainlandingpage/AiPredictionFooter";
import { TradingSmartPricingMatrix } from "../components/landingpage/TradingSmartPricingMatrix";
import { PRICING_PLANS } from "@/constants/pricing";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 50, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const MainLandingPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const { membership, loading: membershipLoading } = useMyTenantMembership(
    user?.id,
  );
  const [isEnquiryModalOpen, setIsEnquiryModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitSuccess, setIsSubmitSuccess] = useState(false);

  const navigate = useNavigate();

  React.useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user || role !== "admin") return;
    if (membershipLoading) return;
    const wlSlug =
      membership?.role === "admin" && membership?.status === "active"
        ? membership?.tenant?.slug
        : null;
    if (wlSlug) navigate(`/wl/${wlSlug}/dashboard`, { replace: true });
    else navigate("/white-label#pricing", { replace: true });
  }, [
    user,
    role,
    authLoading,
    roleLoading,
    membershipLoading,
    membership,
    navigate,
  ]);

  const cursorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Navbar scroll behavior
    const handleScroll = () => {
      const headerUrls = document.querySelectorAll('header');
      headerUrls.forEach(h => {
        if (window.scrollY > 80) {
          h.classList.add('bg-black/80', 'backdrop-blur-xl', 'border-b', 'border-white/[0.06]');
        } else {
          h.classList.remove('bg-black/80', 'backdrop-blur-xl', 'border-b', 'border-white/[0.06]');
        }
      });
    };
    window.addEventListener('scroll', handleScroll);

    // Hero headline GSAP animation
    const tl = gsap.timeline();
    tl.fromTo('.hero-word',
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, stagger: 0.08, duration: 0.8, ease: "power3.out", delay: 0.2 }
    ).fromTo('.hero-underline',
      { scaleX: 0 },
      { scaleX: 1, duration: 0.6, ease: "power3.inOut" },
      "-=0.2"
    );

    // Cursor Follower
    let mouseX = 0;
    let mouseY = 0;
    let cursorX = 0;
    let cursorY = 0;
    let animId: number;
    const isMobile = window.innerWidth < 768;
    
    if (!isMobile) {
      const handleMouseMove = (e: MouseEvent) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
      };
      window.addEventListener('mousemove', handleMouseMove);

      const animateCursor = () => {
        cursorX += (mouseX - cursorX) * 0.15;
        cursorY += (mouseY - cursorY) * 0.15;
        if (cursorRef.current) {
          cursorRef.current.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0) translate(-50%, -50%)`;
        }
        animId = requestAnimationFrame(animateCursor);
      };
      animId = requestAnimationFrame(animateCursor);

      return () => {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('mousemove', handleMouseMove);
        cancelAnimationFrame(animId);
      };
    } else {
      return () => window.removeEventListener('scroll', handleScroll);
    }
  }, []);

  interface FormData {
    name: string;
    email: string;
    phone: string;
    message: string;
    plan: string;
    referral_code: string;
  }

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: "",
      plan: "",
      referral_code: "",
    },
  });

  const handleFormSubmit = async (data: FormData) => {
    setIsSubmitting(true);

    try {
      const planNames: Record<string, string> = {
        starterPlan: "Starter Plan - $49/mo",
        growthPlan: "Growth Plan - $79/mo",
        professionalPlan: "Pro Plan - $129/mo",
        // custom: "Custom solutions available.",
      };

      const emailBody = `Name : ${data.name}\nEmail : ${data.email}\nPhone : ${data.phone}\nInterested Plan : ${planNames[data.plan] || data.plan}\nMessage : \n ${data.message || ""}`;

      const { affiliateId } = getSessionAffiliateAttribution();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types
      await (supabase as any)
        .from("contact_submissions")
        .insert([
          {
            name: data.name,
            email: data.email,
            phone: data.phone,
            description: `Plan: ${planNames[data.plan] || data.plan}\n${data.message || ""}`,
            ...(affiliateId && { affiliate_id: affiliateId }),
            ...(data.referral_code?.trim() && {
              referral_code: data.referral_code.trim(),
            }),
          },
        ])
        .then(() => {})
        .catch(() => {});

      const response = await fetch(
        "https://send-mail-redirect-boostmysites.vercel.app/send-email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            body: emailBody,
            name: "Tradingsmart.AI",
            subject: `New Enquiry from ${data.name} - ${planNames[data.plan] || data.plan}`,
            to: "partnerships@tradingsmart.ai",
          }),
        },
      );

      if (response.ok) {
        reset();
        setIsSubmitSuccess(true);
      } else {
        alert("Failed to submit form. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("An error occurred. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const sectionTitle =
    "text-3xl md:text-4xl font-black mb-8 text-white tracking-tight font-syne";
  const bodyMuted = "text-zinc-400 font-light leading-relaxed font-dm-sans";
  const card =
    "bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] border-t-teal-500/40 border-t p-8 md:p-10 rounded-3xl transition-all duration-300 hover:border-teal-500/30 hover:shadow-[0_0_40px_rgba(20,184,166,0.08)]";

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-teal-500/30 selection:text-teal-100 overflow-x-hidden relative group">
      <div 
        ref={cursorRef} 
        className="fixed top-0 left-0 w-5 h-5 bg-teal-500 rounded-full blur-[4px] pointer-events-none z-[9999] opacity-0 group-hover:opacity-60 transition-opacity duration-300 hidden md:block" 
      />
      <Helmet>
        <title>
          TradingSmart.ai — classic landing | Algo integration &amp; full platform
        </title>
        <meta
          name="description"
          content="Analysis, backtests, strategies, options, paper and live execution—plus done-for-you custom algo integration. Same modules for every subscriber; plans differ on commercial terms."
        />
      </Helmet>

      <AiPredictionHeader />

      {/* Hero */}
      <section
        id="hero"
        className="relative min-h-[100svh] flex items-center justify-center pt-28 pb-20 px-4 overflow-hidden bg-black"
      >
        <Hero3DCanvas />
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/80 to-transparent z-10" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[120px] z-0" />
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="container mx-auto z-20 text-center relative max-w-4xl"
        >
          <motion.h1
            variants={fadeUp}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-black tracking-tight mb-8 leading-[1.1] text-white font-syne relative"
          >
            {"Launch Your Own Algo Trading System ".split(" ").map((word, i) => (
              <span key={`w1-${i}`} className="hero-word inline-block mr-[0.3em] opacity-0 translate-y-10">{word}</span>
            ))}
            <span className="relative inline-block mt-2 sm:mt-0">
              {"Without Coding".split(" ").map((word, i) => (
                <span key={`w2-${i}`} className="hero-word inline-block mr-[0.3em] opacity-0 translate-y-10">{word}</span>
              ))}
              <span className="hero-underline absolute left-0 bottom-[-4px] h-[4px] bg-teal-500 w-[95%] origin-left scale-x-0" />
            </span>
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className={`text-lg md:text-xl ${bodyMuted} max-w-3xl mx-auto mb-6`}
          >
            Build, backtest, and deploy trading strategies with AI — without
            writing a single line of code. Our developers build everything for
            you and integrate your strategy within 72 hours.
          </motion.p>
          <motion.p
            variants={fadeUp}
            className={`text-sm md:text-base text-zinc-400 font-light max-w-2xl mx-auto mb-12 leading-relaxed`}
          >
            We are a technology platform that enables users to integrate and automate their own trading systems. We do not provide any trading strategies, investment advice, or recommendations.
          </motion.p>
          <motion.div
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Button
              type="button"
              onClick={() => navigate("/auth")}
              className="bg-teal-500 hover:bg-teal-400 text-black font-bold text-lg px-10 py-7 rounded-xl shadow-[0_0_30px_rgba(20,184,166,0.3)] border border-teal-400/50 transition-all duration-300 hover:-translate-y-0.5"
            >
              Get Started
            </Button>
            <Button
              onClick={() => setIsEnquiryModalOpen(true)}
              variant="outline"
              className="bg-zinc-900/50 border border-zinc-700 hover:border-teal-500 hover:bg-teal-500/10 text-white font-bold text-lg px-10 py-7 rounded-xl transition-all duration-300 hover:-translate-y-0.5 backdrop-blur-md"
            >
              Book Demo
            </Button>
          </motion.div>
          <motion.p variants={fadeUp} className="text-zinc-500 text-xs mt-4">
            No advisory. No strategy. Pure technology platform.
          </motion.p>
        </motion.div>

        <div className="absolute bottom-0 md:bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-60">
          <div className="w-6 h-10 border-2 border-zinc-500 rounded-full flex justify-center p-1">
            <motion.div
              animate={{ y: [0, 12, 0] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              className="w-1.5 h-1.5 bg-teal-500 rounded-full"
            />
          </div>
          <span className="text-[10px] tracking-[0.2em] font-medium text-zinc-500 font-jetbrains">SCROLL</span>
        </div>
      </section>

      {/* WHAT YOU GET */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        id="what-you-get"
        className="py-24 bg-black relative"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
        <div className="container mx-auto px-4 max-w-7xl">
          <motion.h2
            variants={fadeUp}
            className={`${sectionTitle} text-center`}
          >
            WHAT YOU GET
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
            <motion.div variants={fadeUp} className={`${card} md:col-span-2 flex flex-col justify-center`}>
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-6 font-syne">
                No-Code Algo Trading Integration<br/><span className="text-teal-500 text-xl font-normal">(Done For You)</span>
              </h3>
              <p className="text-zinc-300 mb-8 font-light text-lg">
                Turn your idea into a fully automated trading system — built by
                our developers.
              </p>
              <ul className="grid sm:grid-cols-2 gap-y-4 gap-x-8 text-zinc-300 font-light list-none">
                <li className="flex gap-4 items-start">
                  <DiamondIcon />
                  <span className="leading-snug">Share your strategy or idea (even basic logic is enough)</span>
                </li>
                <li className="flex gap-4 items-start">
                  <DiamondIcon />
                  <span className="leading-snug">Our developers convert it into a working algo system</span>
                </li>
                <li className="flex gap-4 items-start">
                  <DiamondIcon />
                  <span className="leading-snug">Integrated into your broker within 72 hours</span>
                </li>
                <li className="flex gap-4 items-start">
                  <DiamondIcon />
                  <span className="leading-snug">Fully automated execution with real-time monitoring</span>
                </li>
                <li className="flex gap-4 items-start">
                  <DiamondIcon />
                  <span className="leading-snug">Modify or scale anytime</span>
                </li>
              </ul>
              <div className="mt-10 p-5 rounded-2xl bg-teal-500/5 border border-teal-500/10 inline-block">
                <p className="text-teal-50 font-medium leading-relaxed font-jetbrains text-sm">
                  <span className="text-teal-500 mr-2">{">"}</span>You don't need coding. You don't need tech knowledge. We build everything.
                </p>
              </div>
            </motion.div>

            <motion.div variants={fadeUp} className={`${card} md:col-span-1 flex flex-col justify-center`}>
              <h3 className="text-xl md:text-2xl font-bold text-white mb-6 font-syne focus:outline-none">
                AI Backtesting +<br/>Strategy Intelligence
              </h3>
              <p className="text-zinc-400 mb-8 font-light text-sm">
                Test, analyze, and refine before going live.
              </p>
              <ul className="space-y-4 text-zinc-300 font-light text-sm list-none">
                <li className="flex gap-3 items-start">
                  <DiamondIcon />
                  <span className="leading-snug">Backtest your strategy on historical data</span>
                </li>
                <li className="flex gap-3 items-start">
                  <DiamondIcon />
                  <span className="leading-snug">AI-generated performance analysis</span>
                </li>
                <li className="flex gap-3 items-start">
                  <DiamondIcon />
                  <span className="leading-snug">Metrics: win rate, drawdown, profit factor</span>
                </li>
                <li className="flex gap-3 items-start">
                  <DiamondIcon />
                  <span className="leading-snug">Identify strengths, weaknesses, and risk zones</span>
                </li>
                <li className="flex gap-3 items-start">
                  <DiamondIcon />
                  <span className="leading-snug">Improve your strategy with data-backed insights</span>
                </li>
                <li className="flex gap-3 items-start">
                  <DiamondIcon />
                  <span className="leading-snug">Direct transition from backtesting to live deployment</span>
                </li>
              </ul>
              <p className="text-teal-400/80 mt-8 font-medium italic text-sm">
                Trade with clarity, not assumptions.
              </p>
            </motion.div>
          </div>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 mt-16 justify-center items-center">
            <Link 
              to="/ai-trading-analysis-and-back-testing"
              className="px-8 py-4 bg-teal-500 text-black font-bold rounded-full hover:bg-teal-400 transition-all shadow-[0_0_20px_rgba(20,184,166,0.3)] hover:scale-105 active:scale-95 text-center min-w-[260px] font-syne"
            >
              See analysis &amp; backtesting
            </Link>
            <Link 
              to="/pricing"
              className="px-8 py-4 bg-transparent border border-teal-500/50 text-teal-400 font-bold rounded-full hover:bg-teal-500/10 transition-all hover:scale-105 active:scale-95 text-center min-w-[260px] font-syne"
            >
              View pricing
            </Link>
          </motion.div>
          <motion.p variants={fadeUp} className="text-zinc-500 text-xs mt-4 text-center">
            No advisory. No strategy. Pure technology platform.
          </motion.p>
        </div>
      </motion.section>

      {/* HOW IT WORKS */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        id="how-it-works"
        className="py-24 bg-zinc-950 relative"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.h2
            variants={fadeUp}
            className={`${sectionTitle} text-center`}
          >
            HOW IT WORKS
          </motion.h2>
          
          <div className="relative mt-16 pl-6 md:pl-0">
            {/* Vertical Line */}
            <div className="absolute left-[29px] md:left-1/2 top-0 bottom-0 w-px bg-zinc-800 md:-translate-x-1/2">
               <div className="timeline-line absolute top-0 left-0 w-full h-full bg-teal-500 origin-top scale-y-0 shadow-[0_0_10px_rgba(20,184,166,0.5)]" />
            </div>

            <motion.div variants={staggerContainer} className="space-y-12">
              {[
                "Sign up on Trading Smart.ai",
                "Connect your broker securely",
                "Share your strategy idea",
                "Our developers build your system",
                "Strategy integrated within 72 hours",
                "Backtest + analyze with AI",
                "Go live with full control"
              ].map((step, index) => (
                <motion.div key={index} variants={fadeUp} className={`relative flex items-center md:justify-between ${index % 2 === 0 ? 'md:flex-row-reverse' : ''}`}>
                   <div className="md:w-5/12 hidden md:block" />
                   
                   <div className="absolute left-[-29px] md:left-1/2 md:-translate-x-1/2 w-12 h-12 bg-black border border-white/[0.08] rounded-full flex items-center justify-center font-jetbrains text-teal-500 font-bold z-10 shadow-[0_0_20px_rgba(0,0,0,0.8)]">
                     {index + 1}
                   </div>

                   <div className="w-full md:w-5/12 pl-12 md:pl-0">
                     <div className="bg-white/[0.02] backdrop-blur-md border border-white/[0.05] p-6 rounded-2xl hover:border-teal-500/20 transition-colors">
                       <p className="text-lg text-zinc-200 font-light">{step}</p>
                     </div>
                   </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* WHY THIS IS DIFFERENT & WHO IS THIS FOR */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        id="why-and-who"
        className="py-24 bg-black relative"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex flex-col md:flex-row gap-0 rounded-3xl overflow-hidden border border-white/[0.06] shadow-2xl relative">
            <div className="absolute inset-0 pointer-events-none">
               <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-teal-500/5 blur-[100px]" />
               <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-teal-500/5 blur-[100px]" />
            </div>

            <motion.div variants={fadeUp} className="flex-1 bg-white/[0.02] backdrop-blur-xl p-10 md:p-14 md:border-r border-white/[0.06] z-10 relative">
              <h2 className={`${sectionTitle} text-left text-2xl md:text-3xl mb-10`}>WHY THIS IS DIFFERENT</h2>
              <ul className="space-y-6 text-zinc-300 font-light list-none">
                {[
                  "100% no coding required",
                  "Developers build your strategy for you",
                  "Fast 72-hour integration",
                  "AI-powered analysis engine",
                  "Works with your custom logic",
                  "Full control over your trading"
                ].map((text, i) => (
                  <motion.li 
                    key={i} 
                    initial={{ opacity: 0, x: -30 }} 
                    whileInView={{ opacity: 1, x: 0 }} 
                    transition={{ delay: i * 0.1, duration: 0.5 }}
                    viewport={{ once: true }}
                    className="flex gap-4 items-center"
                  >
                    <div className="w-1.5 h-1.5 bg-teal-500 rounded-full shrink-0 shadow-[0_0_8px_rgba(20,184,166,0.8)]" />
                    <span>{text}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            <motion.div variants={fadeUp} className="flex-1 bg-white/[0.05] backdrop-blur-xl p-10 md:p-14 z-10 relative">
              <h2 className={`${sectionTitle} text-left text-2xl md:text-3xl mb-10`}>WHO IS THIS FOR</h2>
              <ul className="space-y-6 text-zinc-300 font-light list-none">
                {[
                  "Traders with ideas but no coding skills",
                  "Beginners who want automation",
                  "Advanced traders scaling multiple strategies",
                  "Anyone tired of manual execution"
                ].map((text, i) => (
                  <motion.li 
                    key={i} 
                    initial={{ opacity: 0, x: 30 }} 
                    whileInView={{ opacity: 1, x: 0 }} 
                    transition={{ delay: i * 0.1, duration: 0.5 }}
                    viewport={{ once: true }}
                    className="flex gap-4 items-center"
                  >
                    <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full shrink-0" />
                    <span>{text}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* PRICING */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        id="pricing"
        className="py-24 bg-zinc-950 relative border-b border-zinc-900"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
        <motion.div variants={fadeUp}>
          <TradingSmartPricingMatrix />
        </motion.div>
        <motion.div variants={fadeUp} className="container mx-auto px-4 max-w-6xl pb-4">
          <Button
            onClick={() => setIsEnquiryModalOpen(true)}
            className="w-full max-w-md mx-auto flex bg-teal-500 hover:bg-teal-400 text-black font-bold text-lg py-6 rounded-2xl shadow-[0_0_30px_rgba(20,184,166,0.2)] transition-all duration-300"
          >
            Start Building Now
          </Button>
          <motion.p variants={fadeUp} className="text-zinc-500 text-xs mt-4 text-center max-w-md mx-auto">
            No advisory. No strategy. Pure technology platform.
          </motion.p>
        </motion.div>
      </motion.section>

      {/* SECURITY & CONTROL */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        id="security"
        className="py-24 bg-black relative"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
        <div className="container mx-auto px-4 max-w-5xl">
          <motion.h2
            variants={fadeUp}
            className={`${sectionTitle} text-center`}
          >
            SECURITY & CONTROL
          </motion.h2>

          <motion.div
            variants={staggerContainer}
            className="grid sm:grid-cols-2 gap-6 mt-16"
          >
            {[
              { text: "You connect your own broker", icon: Lock },
              { text: "You control execution at all times", icon: Eye },
              { text: "You can pause or stop anytime", icon: Pause },
              { text: "No access to your funds", icon: Shield }
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div key={i} variants={fadeUp} className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] p-6 md:p-8 rounded-3xl flex flex-col sm:flex-row gap-6 items-start hover:border-teal-500/20 transition-all duration-300 hover:bg-white/[0.05]">
                  <div className="w-16 h-16 rounded-2xl bg-black border border-white/[0.08] flex items-center justify-center shrink-0 shadow-inner">
                    <Icon className="w-8 h-8 text-teal-500" strokeWidth={1} />
                  </div>
                  <div className="flex-1 flex items-center h-full">
                    <p className="text-xl text-zinc-200 font-light leading-tight">
                      {item.text}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </motion.section>

      {/* DISCLAIMER */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        id="disclaimer"
        className="py-24 bg-zinc-950 relative"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.h2
            variants={fadeUp}
            className={`${sectionTitle} text-center`}
          >
            PLATFORM DISCLAIMER
          </motion.h2>

          <motion.div
            variants={fadeUp}
            className="mt-12 bg-black border border-zinc-800/50 rounded-2xl p-8 md:p-10 font-jetbrains text-xs md:text-sm text-zinc-400 space-y-6 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-zinc-800 via-teal-900 to-zinc-800" />
            <div className="flex justify-center mb-6">
              <Shield className="w-10 h-10 text-teal-500 opacity-80" />
            </div>
            <div className="flex gap-4 items-start">
               <span className="text-teal-500 font-bold shrink-0">{">"}</span>
               <p className="leading-relaxed">This platform is a pure technology service provider offering software infrastructure and integration tools for users to deploy their own trading strategies.</p>
            </div>
            <div className="flex gap-4 items-start">
               <span className="text-teal-500 font-bold shrink-0">{">"}</span>
               <p className="leading-relaxed">We do not provide stock recommendations, trading strategies, investment advice, or portfolio management services.</p>
            </div>
            <div className="flex gap-4 items-start">
               <span className="text-teal-500 font-bold shrink-0">{">"}</span>
               <p className="leading-relaxed">All trading decisions, strategies, and executions are solely determined and controlled by the user.</p>
            </div>
            <div className="flex gap-4 items-start">
               <span className="text-teal-500 font-bold shrink-0">{">"}</span>
               <p className="leading-relaxed">We do not access, manage, or control user brokerage accounts, nor do we execute trades on behalf of users.</p>
            </div>
            <div className="flex gap-4 items-start">
               <span className="text-teal-500 font-bold shrink-0">{">"}</span>
               <p className="leading-relaxed">Users are fully responsible for their financial decisions and outcomes.</p>
            </div>
            <div className="flex gap-4 items-start">
               <span className="text-teal-500 font-bold shrink-0">{">"}</span>
               <p className="leading-relaxed">This platform does not guarantee any profits or returns and is not affiliated with any regulatory advisory services under the Securities and Exchange Board of India (SEBI).</p>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* START NOW */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        id="start-now"
        className="py-32 relative overflow-hidden bg-black border-t border-zinc-900"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
        
        <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none">
          <div className="text-[20rem] font-syne font-black text-teal-500/5 select-none leading-none -translate-y-8 absolute hidden md:block">72</div>
          <div className="w-[800px] h-[800px] bg-teal-500/5 rounded-full blur-[200px]" />
        </div>

        <div className="container mx-auto px-4 relative z-10 text-center max-w-4xl">
          <motion.h2 variants={fadeUp} className={`${sectionTitle} text-5xl md:text-7xl mb-12 drop-shadow-2xl`}>
            START NOW
          </motion.h2>
          <motion.p variants={fadeUp} className={`${bodyMuted} text-2xl md:text-3xl mb-16 font-light max-w-2xl mx-auto`}>
            Build your automated trading system in the next 72 hours.
          </motion.p>
          <motion.div
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-6 justify-center items-center"
          >
            <Button
              onClick={() => setIsEnquiryModalOpen(true)}
              className="bg-teal-500 hover:bg-teal-400 text-black font-bold text-xl px-12 py-8 rounded-2xl shadow-[0_0_40px_rgba(20,184,166,0.3)] transition-all duration-300 hover:-translate-y-1 w-full sm:w-auto"
            >
              Get Started Now
            </Button>
            <Button
              onClick={() => setIsEnquiryModalOpen(true)}
              variant="outline"
              className="bg-black/50 backdrop-blur-md border border-zinc-700 hover:border-teal-500/50 hover:bg-teal-500/10 text-white font-bold text-xl px-12 py-8 rounded-2xl transition-all duration-300 hover:-translate-y-1 w-full sm:w-auto"
            >
              Talk to Our Team
            </Button>
          </motion.div>
          <motion.p variants={fadeUp} className="text-zinc-500 text-xs mt-6 text-center w-full">
            No advisory. No strategy. Pure technology platform.
          </motion.p>
        </div>
      </motion.section>

      <AiPredictionFooter />

      <Dialog
        open={isEnquiryModalOpen}
        onOpenChange={(open) => {
          setIsEnquiryModalOpen(open);
          if (!open) setIsSubmitSuccess(false);
        }}
      >
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] bg-zinc-950 border border-zinc-800 text-white p-6 sm:p-8 rounded-3xl shadow-2xl overflow-y-auto">
          {isSubmitSuccess ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-6">
              <div className="w-20 h-20 rounded-full bg-teal-500/15 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-teal-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <DialogTitle className="text-2xl font-black text-white mb-2">
                  Request Submitted!
                </DialogTitle>
                <p className="text-zinc-400 font-light">
                  Thank you! Our partnerships team will reach out to you
                  shortly.
                </p>
              </div>
              <Button
                onClick={() => {
                  setIsEnquiryModalOpen(false);
                  setIsSubmitSuccess(false);
                }}
                className="bg-teal-500 hover:bg-teal-400 text-black font-bold px-8 py-3 rounded-xl"
              >
                Close
              </Button>
            </div>
          ) : (
            <>
              <div className="relative border-b border-zinc-800 pb-4 mb-6 pr-10">
                <DialogTitle className="text-3xl font-black text-white text-left tracking-tight">
                  Start Now
                </DialogTitle>
                <p className="text-zinc-400 text-sm mt-2 text-left font-light">
                  Fill out the form below and our partnerships team will reach
                  out.
                </p>
              </div>

              <form
                className="space-y-6"
                onSubmit={handleSubmit(handleFormSubmit)}
              >
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2 text-left">
                    <Label htmlFor="name" className="text-zinc-300 font-medium">
                      Full Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="John Doe"
                      {...register("name", {
                        required: "Full name is required",
                      })}
                      className={`bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all ${errors.name ? "border-red-500" : ""}`}
                    />
                    {errors.name && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.name.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 text-left">
                    <Label
                      htmlFor="email"
                      className="text-zinc-300 font-medium"
                    >
                      Email Address <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@example.com"
                      {...register("email", {
                        required: "Email is required",
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: "Invalid email address",
                        },
                      })}
                      className={`bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all ${errors.email ? "border-red-500" : ""}`}
                    />
                    {errors.email && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.email.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2 text-left">
                    <Label
                      htmlFor="phone"
                      className="text-zinc-300 font-medium"
                    >
                      Phone Number <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1 234 567 8900"
                      {...register("phone", {
                        required: "Phone number is required",
                        pattern: {
                          value: /^\+?[0-9\s-]+$/,
                          message: "Please enter a valid phone number",
                        },
                      })}
                      className={`bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all ${errors.phone ? "border-red-500" : ""}`}
                    />
                    {errors.phone && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.phone.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 text-left">
                    <Label htmlFor="plan" className="text-zinc-300 font-medium">
                      Interested Plan <span className="text-red-500">*</span>
                    </Label>
                    <Controller
                      name="plan"
                      control={control}
                      rules={{ required: "Please select a plan" }}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger
                            className={`bg-black border-zinc-800 text-white focus:border-teal-500 focus:ring-teal-500/20 ${errors.plan ? "border-red-500" : ""}`}
                          >
                            <SelectValue placeholder="Select a plan/option" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                            {PRICING_PLANS.map((plan) => (
                              <SelectItem
                                key={plan.id}
                                value={plan.id}
                                className="focus:bg-teal-500/20 focus:text-teal-400"
                              >
                                {plan.name} - ${plan.price}/mo
                              </SelectItem>
                            ))}
                            {/* <SelectItem
                              value="custom"
                              className="focus:bg-teal-500/20 focus:text-teal-400"
                            >
                              Custom solutions available.
                            </SelectItem> */}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.plan && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.plan.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2 text-left">
                  <Label
                    htmlFor="message"
                    className="text-zinc-300 font-medium"
                  >
                    Message <span className="text-red-500">*</span>
                    <span className="ml-2 text-[10px] text-zinc-500 font-normal">
                      (Max 20 words)
                    </span>
                  </Label>
                  <Textarea
                    id="message"
                    placeholder="Tell us about your strategy or requirements..."
                    rows={4}
                    {...register("message", {
                      required: "Message is required",
                      validate: (value) => {
                        const words = value.trim().split(/\s+/).filter(w => w.length > 0);
                        return words.length <= 20 || `Maximum 20 words allowed (current: ${words.length})`;
                      }
                    })}
                    className={`bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all resize-none ${errors.message ? "border-red-500" : ""}`}
                  />
                  {errors.message && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.message.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2 text-left">
                  <Label
                    htmlFor="referral_code"
                    className="text-zinc-300 font-medium"
                  >
                    Referral Code
                    <span className="ml-2 text-xs font-normal text-zinc-500">
                      (Optional)
                    </span>
                  </Label>
                  <Input
                    id="referral_code"
                    type="text"
                    placeholder="e.g. john2024"
                    {...register("referral_code")}
                    className="bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEnquiryModalOpen(false)}
                    className="flex-1 bg-transparent border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors h-14 rounded-xl font-bold"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-teal-500 hover:bg-teal-400 text-black font-bold h-14 rounded-xl shadow-[0_0_20px_rgba(20,184,166,0.2)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? "Submitting..." : "Submit Request"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MainLandingPage;
