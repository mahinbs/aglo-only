import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { Helmet } from "react-helmet-async";
import { useNavigate, Link } from "react-router-dom";
import { getSessionAffiliateAttribution } from "@/hooks/useAffiliateRef";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useMyTenantMembership } from "@/hooks/useWhitelabel";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Shield, Eye, Pause, Lock, Clock, UserPlus, Code2, Rocket, Link2, Lightbulb, Cpu, LineChart, Globe, CheckCircle2, TrendingDown, DollarSign, Wrench, ChevronDown, BarChart3, FlaskConical, Layers, Banknote, Zap } from "lucide-react";
import { Button } from "../components/ui/button";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import heroVid from '../assets/landingpage/hero-vid.webm'
import bgVid from '../assets/landingpage/bg.mp4'
import dash1 from '../assets/landingpage/dash-1.png'
import dash2 from '../assets/landingpage/dash-2.png'
import dash3 from '../assets/landingpage/dash-3.png'
import dash4 from '../assets/landingpage/dash-4.png'
import dash5 from '../assets/landingpage/dash-5.png'

const dashScreenshots = [dash1, dash2, dash3, dash4, dash5];

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

const LandingPageNew = () => {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const { membership, loading: membershipLoading } = useMyTenantMembership(
    user?.id,
  );
  const [isEnquiryModalOpen, setIsEnquiryModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitSuccess, setIsSubmitSuccess] = useState(false);
  const [isInlineSubmitting, setIsInlineSubmitting] = useState(false);
  const [isInlineSubmitSuccess, setIsInlineSubmitSuccess] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [dashIndex, setDashIndex] = useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setDashIndex((prev) => (prev + 1) % dashScreenshots.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

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

  const {
    register: inlineRegister,
    handleSubmit: inlineHandleSubmit,
    control: inlineControl,
    reset: inlineReset,
    formState: { errors: inlineErrors },
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
        .then(() => { })
        .catch(() => { });

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

  const handleInlineFormSubmit = async (data: FormData) => {
    setIsInlineSubmitting(true);
    try {
      const planNames: Record<string, string> = {
        starterPlan: "Starter Plan - $49/mo",
        growthPlan: "Growth Plan - $79/mo",
        professionalPlan: "Pro Plan - $129/mo",
      };
      const emailBody = `Name : ${data.name}\nEmail : ${data.email}\nPhone : ${data.phone}\nInterested Plan : ${planNames[data.plan] || data.plan}\nMessage : \n ${data.message || ""}`;
      const { affiliateId } = getSessionAffiliateAttribution();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("contact_submissions")
        .insert([{
          name: data.name,
          email: data.email,
          phone: data.phone,
          description: `Plan: ${planNames[data.plan] || data.plan}\n${data.message || ""}`,
          ...(affiliateId && { affiliate_id: affiliateId }),
          ...(data.referral_code?.trim() && { referral_code: data.referral_code.trim() }),
        }])
        .then(() => {}).catch(() => {});
      const response = await fetch(
        "https://send-mail-redirect-boostmysites.vercel.app/send-email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: emailBody,
            name: "Tradingsmart.AI",
            subject: `New Enquiry from ${data.name} - ${planNames[data.plan] || data.plan}`,
            to: "partnerships@tradingsmart.ai",
          }),
        }
      );
      if (response.ok) {
        inlineReset();
        setIsInlineSubmitSuccess(true);
      } else {
        alert("Failed to submit form. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("An error occurred. Please try again later.");
    } finally {
      setIsInlineSubmitting(false);
    }
  };

  const sectionTitle =
    "text-3xl md:text-4xl lg:text-7xl !capitalize font-black mb-8 text-white tracking-tight font-syne";
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
          Trading platform: analysis, backtests, options, paper &amp; live | TradingSmart.ai
        </title>
        <meta
          name="description"
          content="One workspace for AI-assisted analysis, deep backtests, strategies, options, and paper-to-live trading. Every subscriber gets the full platform—our team integrates your custom algo logic into a broker-ready stack."
        />
      </Helmet>

      <AiPredictionHeader />

      {/* Hero */}
      <section
        id="hero"
        className="relative min-h-[100svh] flex items-center justify-center pt-28 pb-20 px-4 overflow-hidden"
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          className="absolute inset-0 w-full h-full object-cover z-0 opacity-60"
        >
          <source src={bgVid} type="video/mp4" />
        </video>

        <div className="absolute inset-0 z-[1] pointer-events-none">
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/80 to-transparent z-10" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-teal-500/10 rounded-full blur-[120px] z-0" />
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="container mx-auto z-20 text-center relative max-w-6xl pt-10 flex flex-col items-center"
        >
          <motion.div
            variants={fadeUp}
            className="mb-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-500/10 border border-teal-500/20 backdrop-blur-md"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-xs font-bold text-teal-400 tracking-wide">1,500+ Algo Systems Deployed</span>
          </motion.div>
          <motion.h1
            variants={fadeUp}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-[6rem] font-black tracking-tight mb-8 leading-[1.1] text-white font-syne relative"
          >
            {["Stop manual trading."].map((word, i) => (
              <span key={`w1-${i}`} className="hero-word inline-block mr-[0.3em] opacity-0 translate-y-10">{word}</span>
            ))}
            <span key={'w2'} className="relative inline-block">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary inline-block mr-[0.3em]"> Automate your strategy in 72 hours.</span>
            </span>
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className={`text-base md:text-lg text-white font-medium max-w-2xl mx-auto mb-3 leading-relaxed`}
          >
            We build your AI trading system and connect it to your broker — no coding, no complexity, live within 72 hours.
          </motion.p>
          <motion.p
            variants={fadeUp}
            className={`text-xs md:text-sm text-white/80 font-light max-w-2xl mx-auto mb-12 leading-relaxed`}
          >
            You stay in control of every decision. We provide the technology infrastructure and integration tools; we do not provide investment advice or trade recommendations.
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
              Automate My Strategy
            </Button>
            <Button
              onClick={() => setIsEnquiryModalOpen(true)}
              variant="outline"
              className="bg-zinc-900/50 border border-zinc-700 hover:border-teal-500 hover:bg-teal-500/10 text-white font-bold text-lg px-10 py-7 rounded-xl transition-all duration-300 hover:-translate-y-0.5 backdrop-blur-md"
            >
              Book Free Automation Call
            </Button>
          </motion.div>
          <motion.div
            variants={fadeUp}
            className="mt-20 relative w-full max-w-5xl mx-auto"
          >
            {/* Extended glow effects behind video */}
            <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none opacity-50" />
            <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-secondary/20 rounded-full blur-[120px] pointer-events-none opacity-50" />
            
            <div className="relative p-[2px] rounded-[2rem] bg-gradient-to-br from-primary via-primary/50 to-secondary shadow-[0_0_100px_rgba(20,184,166,0.15),0_0_50px_rgba(14,165,233,0.1)] transition-all duration-500 hover:shadow-[0_0_120px_rgba(20,184,166,0.2),0_0_70px_rgba(14,165,233,0.15)]">
              <div className="relative rounded-[calc(2rem-1.5px)] overflow-hidden bg-zinc-950/40 backdrop-blur-md">
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  disablePictureInPicture
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-full h-auto block"
                >
                  <source src={heroVid} type="video/webm" />
                </video>
                
                {/* Mirroring reflections */}
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </div>
            </div>
          </motion.div>
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

      {/* TRUST BAR */}
      <div className="bg-zinc-950 border-y border-zinc-900">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 divide-x divide-zinc-800/60">
            {[
              { icon: Rocket, value: "1,500+", label: "Algo Systems Deployed" },
              { icon: Clock, value: "72 hrs", label: "Avg. Integration Time" },
              { icon: Globe, value: "All API Brokers", label: "Supported" },
              { icon: CheckCircle2, value: "Completely", label: "Done For You" },
            ].map((tile, i) => (
              <div key={i} className="flex flex-col items-center justify-center py-8 px-6 text-center gap-2">
                <tile.icon className="w-5 h-5 text-teal-500 mb-1" />
                <span className="text-xl md:text-2xl font-black text-white font-syne">{tile.value}</span>
                <span className="text-xs text-zinc-500 font-light">{tile.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* THE PROBLEM */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        className="py-24 bg-black relative overflow-hidden"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
        <div className="container mx-auto px-4 max-w-7xl relative z-10">
          <div className="text-center mb-16">
            <motion.h2 variants={fadeUp} className={`${sectionTitle}`}>
              Still trading manually?
            </motion.h2>
            <motion.p variants={fadeUp} className={`${bodyMuted} max-w-2xl mx-auto text-lg`}>
              Here's what that's actually costing you.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
            {[
              {
                icon: Clock,
                title: "Hours lost every day",
                body: "Watching screens for 4–6 hours, missing signals the moment you look away. Your strategy only runs when you're physically present.",
              },
              {
                icon: TrendingDown,
                title: "Emotional execution",
                body: "Fear on the entry. Greed on the exit. One bad news spike and the whole plan goes out the window.",
              },
              {
                icon: Lightbulb,
                title: "Strategy stuck in your head",
                body: "You know what works. You've tested it mentally. But it never actually runs because no one built it for you.",
              },
              {
                icon: DollarSign,
                title: "Developer quotes are brutal",
                body: "$500–$2,000+ to build one basic algo — and developers disappear the moment you need a change.",
              },
            ].map((item, i) => (
              <motion.div key={i} variants={fadeUp} className={`${card} flex flex-col gap-5`}>
                <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-teal-500/5 border border-teal-500/10">
                  <item.icon className="w-6 h-6 text-teal-500" />
                </div>
                <h3 className="text-white font-bold text-lg leading-snug">{item.title}</h3>
                <p className="text-zinc-400 text-sm font-light leading-relaxed">{item.body}</p>
              </motion.div>
            ))}
          </div>

          {/* Dashboard Screenshot Slideshow */}
          <motion.div variants={fadeUp} className="relative mx-auto max-w-5xl">
            <div className="relative p-[2px] rounded-2xl bg-gradient-to-br from-teal-500/40 via-teal-500/10 to-zinc-800 shadow-[0_0_60px_rgba(20,184,166,0.1)]">
              <div className="relative rounded-[calc(1rem-1.5px)] overflow-hidden bg-zinc-950 aspect-video">
                <AnimatePresence mode="crossfade">
                  <motion.img
                    key={dashIndex}
                    src={dashScreenshots[dashIndex]}
                    alt={`TradingSmart.ai dashboard view ${dashIndex + 1}`}
                    className="absolute inset-0 w-full h-full object-cover"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2, ease: "easeInOut" }}
                  />
                </AnimatePresence>
                {/* Dot indicators */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                  {dashScreenshots.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setDashIndex(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === dashIndex ? "bg-teal-400 w-4" : "bg-white/30 hover:bg-white/60"}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <p className="text-center text-zinc-600 text-xs mt-4">TradingSmart.ai Dashboard</p>
          </motion.div>
        </div>
      </motion.section>

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
            What You Get
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
            <motion.div variants={fadeUp} className={`${card} md:col-span-2 flex flex-col justify-center`}>
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-6 font-syne">
                No-Code Algo Trading Integration<br /><span className="text-teal-500 text-xl font-normal">(Done For You)</span>
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
                AI Backtesting +<br />Strategy Intelligence
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
                  <span className="leading-snug">Drawdown, profit factor, and trade-level stats</span>
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

          {/* Outcome row */}
          <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            {[
              { icon: Clock, outcome: "Save 5–10 hours of manual chart-watching every day" },
              { icon: CheckCircle2, outcome: "Execute without emotion — entries and exits run exactly as planned" },
              { icon: Wrench, outcome: "Modify your logic on demand — our team handles all changes" },
            ].map((item, i) => (
              <motion.div key={i} variants={fadeUp} className="flex items-start gap-4 p-6 rounded-2xl bg-teal-500/[0.03] border border-teal-500/10">
                <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/20 shrink-0">
                  <item.icon className="w-5 h-5 text-teal-400" />
                </div>
                <p className="text-zinc-300 text-sm font-light leading-relaxed">{item.outcome}</p>
              </motion.div>
            ))}
          </motion.div>

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
        </div>
      </motion.section>

      {/* HOW IT WORKS */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        id="how-it-works"
        className="py-24 bg-zinc-950 relative overflow-hidden"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
        <div className="container mx-auto px-4 max-w-7xl relative z-10">
          <div className="text-center mb-16 relative z-10">
            <motion.h2 variants={fadeUp} className={`${sectionTitle}`}>
              How It Works
            </motion.h2>
            <motion.p variants={fadeUp} className={`${bodyMuted} max-w-2xl mx-auto text-lg`}>
              A seamless journey from strategy concept to fully automated execution.
            </motion.p>
          </div>

          <div className="flex flex-col gap-6 mt-20 relative z-10">
            {/* Row 1: Steps 1-4 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { step: 1, text: "Sign up on TradingSmart.ai", icon: UserPlus },
                { step: 2, text: "Connect your broker securely", icon: Link2 },
                { step: 3, text: "Share your strategy idea", icon: Lightbulb },
                { step: 4, text: "Our developers build your system", icon: Code2 },
              ].map((item, idx) => (
                <motion.div
                  key={idx}
                  variants={fadeUp}
                  className={`${card} border-teal-500/5 hover:border-teal-500/20 group relative overflow-hidden py-8 px-6 flex flex-col items-start transition-all duration-500`}
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 blur-2xl -mr-12 -mt-12 group-hover:opacity-100 transition-opacity opacity-0" />
                  <div className="flex justify-between items-start w-full mb-6">
                    <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-teal-500/5 border border-teal-500/10 group-hover:scale-110 group-hover:bg-teal-500/10 transition-all">
                      <item.icon className="w-6 h-6 text-teal-400" />
                    </div>
                    <span className="text-4xl font-black text-white/5 font-syne group-hover:text-teal-500/10 transition-colors">{item.step}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white leading-tight">
                    {item.text}
                  </h3>
                </motion.div>
              ))}
            </div>

            {/* Row 2: Steps 5-7 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { step: 5, text: "Strategy integrated within 72 hours", icon: Cpu, highlight: true },
                { step: 6, text: "Backtest + analyze with AI", icon: LineChart },
                { step: 7, text: "Go live with full control", icon: Rocket },
              ].map((item, idx) => (
                <motion.div
                  key={idx}
                  variants={fadeUp}
                  className={`${card} border-teal-500/5 hover:border-teal-500/20 group relative overflow-hidden py-10 px-8 flex flex-col items-start transition-all duration-500`}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 blur-3xl -mr-16 -mt-16 group-hover:opacity-100 transition-opacity opacity-0" />
                  <div className="flex justify-between items-start w-full mb-8">
                    <div className={`w-14 h-14 flex items-center justify-center rounded-2xl bg-teal-500/5 border border-teal-500/10 group-hover:scale-110 ${item.highlight ? 'bg-teal-500/10 border-teal-500/30' : ''} transition-all`}>
                      <item.icon className="w-7 h-7 text-teal-400" />
                    </div>
                    <span className="text-6xl font-black text-white/5 font-syne group-hover:text-teal-500/10 transition-colors">{item.step}</span>
                  </div>
                  <h3 className={`text-xl font-bold text-white ${item.highlight ? 'text-teal-400' : ''}`}>
                    {item.text}
                  </h3>
                  {item.step === 5 && (
                    <div className="mt-4 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                      <span className="text-[10px] text-teal-500/80 font-bold tracking-widest uppercase">Fast Integration</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
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
              <h2 className={`${sectionTitle} text-left text-2xl md:text-3xl mb-10`}>Why This Is Different</h2>
              <ul className="space-y-6 text-zinc-300 font-light list-none">
                {[
                  "100% no coding required",
                  "Developers build your strategy for you",
                  "Fast 72-hour integration",
                  "AI-assisted analysis tooling",
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
              <h2 className={`${sectionTitle} text-left text-2xl md:text-3xl mb-10`}>Who This Is For</h2>
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

      {/* FULL PLATFORM — product modules overview */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        id="full-platform"
        className="py-24 bg-black relative border-b border-zinc-900"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
        <div className="container mx-auto px-4 max-w-6xl relative z-10">
          <div className="flex items-center gap-4 mb-6 justify-center md:justify-start">
            <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse shrink-0" />
            <span className="text-[11px] text-zinc-500 tracking-[0.3em] uppercase font-medium">
              FULL PLATFORM
            </span>
          </div>
          <motion.h2 variants={fadeUp} className={`${sectionTitle} text-center md:text-left max-w-4xl`}>
            One workspace for analysis, backtests, strategies, options, and execution
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-4 text-center md:text-left text-white text-base md:text-lg font-semibold max-w-4xl font-dm-sans"
          >
            Your edge isn&apos;t a locked feature. It&apos;s the support you get from our team to integrate your strategy into a live, broker-ready stack.
          </motion.p>
          <motion.p variants={fadeUp} className={`${bodyMuted} mt-6 max-w-3xl text-center md:text-left text-base`}>
            Every subscriber gets the same product surface: AI-assisted analysis, deep backtests, strategy management, options workflows, and paper-to-live trade tracking in one dashboard. What separates TradingSmart is{" "}
            <span className="text-zinc-200 font-medium">done-for-you custom algo integration</span>
            —we encode the logic, wire the broker path, and ship deployable automation—not a menu of paid add-ons.
          </motion.p>

          <motion.div
            variants={staggerContainer}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-14"
          >
            {[
              {
                icon: BarChart3,
                title: "AI trading analysis",
                body: "Multi-factor validation and plain-English context on setups so users see why a case passed or failed your rules—not a black box.",
              },
              {
                icon: FlaskConical,
                title: "Deep backtesting",
                body: "Run strategies on historical data with per-trade detail: entries, exits, indicator state, and AI summaries for post-run review.",
              },
              {
                icon: Code2,
                title: "Custom algo integration (core moat)",
                body: "You describe the strategy; our engineers implement, validate, and deploy it for production—presets and builder included so nothing stays stuck in a spreadsheet.",
              },
              {
                icon: Layers,
                title: "Options strategy workspace",
                body: "Design and manage options strategies alongside equities workflows inside the trading hub—built for traders who run more than single-leg spot ideas.",
              },
              {
                icon: Banknote,
                title: "Paper trading",
                body: "Practice and prove workflows without capital at risk; move to live only when the user and your team are ready.",
              },
              {
                icon: Zap,
                title: "Live execution & control",
                body: "Broker-connected orders, open positions, armed strategies, and safety controls users expect from a serious trading stack.",
              },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] hover:border-teal-500/25 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-teal-400" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-white font-semibold text-sm mb-2">{item.title}</h3>
                  <p className="text-zinc-400 text-sm font-light leading-relaxed">{item.body}</p>
                </motion.div>
              );
            })}
          </motion.div>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 mt-12 justify-center md:justify-start">
            <Link
              to="/ai-trading-analysis-and-back-testing"
              className="inline-flex items-center justify-center px-8 py-3.5 bg-teal-500 text-black font-bold rounded-full hover:bg-teal-400 transition-colors text-sm font-syne"
            >
              See analysis &amp; backtesting
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center px-8 py-3.5 border border-teal-500/40 text-teal-400 font-bold rounded-full hover:bg-teal-500/10 transition-colors text-sm font-syne"
            >
              View pricing
            </Link>
          </motion.div>
        </div>
      </motion.section>

      {/* TESTIMONIALS */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        id="testimonials"
        className="py-24 bg-zinc-950 relative"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.h2 variants={fadeUp} className={`${sectionTitle} text-center`}>
            What traders are saying
          </motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
            {[
              {
                initial: "R",
                name: "Rahul D.",
                city: "Pune",
                color: "bg-teal-500",
                quote: "Honestly havent come accross another service like this. Everyone either sells signals or teaches you to code yourself. These guys actually built my algo, connected it to my broker, and had it running. Nothing else like it.",
              },
              {
                initial: "S",
                name: "Sneha K.",
                city: "Chennai",
                color: "bg-amber-400",
                quote: "The reason I paid was simple. They do everthing for you. Described my crossover stragety on a call and 3 days later it was live on Zerodha. Didnt touch a single line of code.",
              },
              {
                initial: "V",
                name: "Vikram P.",
                city: "Ahmedabad",
                color: "bg-blue-500",
                quote: "Every platform I tried gave me indicators and paramters to tweak but my actual strategy logic couldnt fit into any of them. Was about to give up on automation completley. TradingSmart just got it.",
              },
            ].map((t, i) => (
              <motion.div key={i} variants={fadeUp} className={`${card} flex flex-col gap-5`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full ${t.color} flex items-center justify-center text-black font-black text-lg shrink-0`}>
                    {t.initial}
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">{t.name}</p>
                    <p className="text-zinc-500 text-xs">{t.city}</p>
                  </div>
                </div>
                <div className="text-amber-400 text-sm tracking-wide">{"★★★★★"}</div>
                <p className="text-zinc-300 text-sm font-light leading-relaxed">"{t.quote}"</p>
              </motion.div>
            ))}
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
            Automate My Strategy
          </Button>
        </motion.div>
      </motion.section>

      {/* FAQ */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        id="faq"
        className="py-24 bg-black relative"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.h2 variants={fadeUp} className={`${sectionTitle} text-center`}>
            Frequently Asked Questions
          </motion.h2>
          <motion.div variants={staggerContainer} className="mt-12 space-y-3">
            {[
              {
                q: "Which brokers are supported?",
                a: "Any broker that provides API access — Zerodha, Fyers, Dhan, Angel One, Upstox, and others globally. If your broker has an API, we can integrate it.",
              },
              {
                q: "Do I need coding or technical experience?",
                a: "None at all. You describe your strategy logic in plain language, and our team handles all the coding and broker integration from start to finish.",
              },
              {
                q: "What if I don't have a strategy yet?",
                a: "No problem. We connect you with a trading professional who helps you define and refine a strategy before we start building.",
              },
              {
                q: "What if my strategy can't be automated?",
                a: "If our team determines it cannot be coded and integrated, you receive a full refund — no questions asked.",
              },
              {
                q: "How long does the whole process take?",
                a: "Most strategies go live within 72 hours of your strategy brief being confirmed by our team.",
              },
              {
                q: "Can I make changes after deployment?",
                a: "Yes. Any modification request is handled by the team. Growth and Pro plans support multiple strategies running simultaneously.",
              },
              {
                q: "Do you support options and equities in the same platform?",
                a: "Yes. Subscribers use the trading dashboard for execution and monitoring, including an options-focused workspace alongside equity and strategy tools.",
              },
              {
                q: "Can users paper trade before going live?",
                a: "Yes. Paper workflows let users validate process and discipline before connecting live capital and broker execution.",
              },
              {
                q: "Are options or backtests limited to higher plans?",
                a: "No. The full platform capability set is included for every subscriber. Plans differ on commercial terms (such as billing and support), not on turning major modules off.",
              },
              {
                q: "What do you actually build for me?",
                a: "We take your strategy specification and deliver integrated, production-oriented automation inside the platform—coding, validation layers, and broker-aligned deployment—not a generic indicator pack.",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="border border-zinc-800 rounded-2xl overflow-hidden"
              >
                <button
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-white/[0.02] transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="text-white font-medium text-sm md:text-base">{item.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-zinc-500 shrink-0 transition-transform duration-300 ${openFaq === i ? "rotate-180" : ""}`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 border-t border-zinc-800/50">
                    <p className="text-zinc-400 font-light text-sm leading-relaxed pt-4">{item.a}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
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
            Security & Control
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

      {/* PLATFORM DISCLAIMER */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        className="py-16 bg-zinc-950 relative"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-zinc-700/40 to-transparent" />
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div
            variants={fadeUp}
            className="bg-black border border-zinc-800/60 rounded-2xl p-6 md:p-8 font-jetbrains text-xs text-zinc-500 space-y-4 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-900" />
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-4 h-4 text-zinc-600 shrink-0" />
              <span className="text-zinc-400 font-bold tracking-widest text-[10px] uppercase">Platform Disclaimer</span>
            </div>
            <p className="leading-relaxed">This platform is a pure technology service provider offering software infrastructure and integration tools for users to deploy their own trading strategies. We do not provide stock recommendations, trading strategies, investment advice, or portfolio management services.</p>
            <p className="leading-relaxed">All trading decisions, strategies, and executions are solely determined and controlled by the user. We do not access, manage, or control user brokerage accounts, nor do we execute trades on behalf of users. Users are fully responsible for their financial decisions and outcomes.</p>
            <p className="leading-relaxed">This platform does not guarantee any profits or returns and is not affiliated with any regulatory advisory services under the Securities and Exchange Board of India (SEBI).</p>
          </motion.div>
        </div>
      </motion.section>

      {/* INLINE LEAD FORM */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        id="start-now"
        className="py-24 bg-zinc-950 relative overflow-hidden"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
        <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none">
          <div className="w-[600px] h-[600px] bg-teal-500/5 rounded-full blur-[180px]" />
        </div>

        <div className="container mx-auto px-4 relative z-10 max-w-2xl">
          <motion.h2 variants={fadeUp} className={`${sectionTitle} text-center`}>
            Automate My Strategy — Start Here
          </motion.h2>
          <motion.p variants={fadeUp} className={`${bodyMuted} text-center text-lg mb-12`}>
            Fill in your details and our team will reach out within 24 hours.
          </motion.p>

          {isInlineSubmitSuccess ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-16 text-center gap-6"
            >
              <div className="w-20 h-20 rounded-full bg-teal-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-teal-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-white mb-2">Request Submitted!</p>
                <p className="text-zinc-400 font-light">Our partnerships team will reach out to you shortly.</p>
              </div>
            </motion.div>
          ) : (
            <motion.form
              variants={fadeUp}
              className="space-y-5 bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] rounded-3xl p-8 md:p-10"
              onSubmit={inlineHandleSubmit(handleInlineFormSubmit)}
            >
              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="inline-name" className="text-zinc-300 font-medium text-sm">
                    Full Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="inline-name"
                    type="text"
                    placeholder="John Doe"
                    {...inlineRegister("name", { required: "Full name is required" })}
                    className={`bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all ${inlineErrors.name ? "border-red-500" : ""}`}
                  />
                  {inlineErrors.name && <p className="text-red-500 text-xs">{inlineErrors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inline-email" className="text-zinc-300 font-medium text-sm">
                    Email Address <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="inline-email"
                    type="email"
                    placeholder="john@example.com"
                    {...inlineRegister("email", {
                      required: "Email is required",
                      pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: "Invalid email address" },
                    })}
                    className={`bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all ${inlineErrors.email ? "border-red-500" : ""}`}
                  />
                  {inlineErrors.email && <p className="text-red-500 text-xs">{inlineErrors.email.message}</p>}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="inline-phone" className="text-zinc-300 font-medium text-sm">
                    Phone Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="inline-phone"
                    type="tel"
                    placeholder="+1 234 567 8900"
                    {...inlineRegister("phone", {
                      required: "Phone number is required",
                      pattern: { value: /^\+?[0-9\s-]+$/, message: "Please enter a valid phone number" },
                    })}
                    className={`bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all ${inlineErrors.phone ? "border-red-500" : ""}`}
                  />
                  {inlineErrors.phone && <p className="text-red-500 text-xs">{inlineErrors.phone.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inline-plan" className="text-zinc-300 font-medium text-sm">
                    Interested Plan <span className="text-red-500">*</span>
                  </Label>
                  <Controller
                    name="plan"
                    control={inlineControl}
                    rules={{ required: "Please select a plan" }}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger
                          className={`bg-black border-zinc-800 text-white focus:border-teal-500 focus:ring-teal-500/20 ${inlineErrors.plan ? "border-red-500" : ""}`}
                        >
                          <SelectValue placeholder="Select a plan" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                          {PRICING_PLANS.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id} className="focus:bg-teal-500/20 focus:text-teal-400">
                              {plan.name} - ${plan.price}/mo
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {inlineErrors.plan && <p className="text-red-500 text-xs">{inlineErrors.plan.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inline-message" className="text-zinc-300 font-medium text-sm">
                  Briefly describe your strategy{" "}
                  <span className="text-red-500">*</span>
                  <span className="ml-2 text-[10px] text-zinc-500 font-normal">(Max 20 words)</span>
                </Label>
                <Textarea
                  id="inline-message"
                  placeholder="e.g. RSI crossover on Nifty futures, buy signal when RSI crosses 30..."
                  rows={3}
                  {...inlineRegister("message", {
                    required: "Please describe your strategy",
                    validate: (value) => {
                      const words = value.trim().split(/\s+/).filter((w) => w.length > 0);
                      return words.length <= 20 || `Maximum 20 words allowed (current: ${words.length})`;
                    },
                  })}
                  className={`bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:border-teal-500 focus:ring-teal-500/20 transition-all resize-none ${inlineErrors.message ? "border-red-500" : ""}`}
                />
                {inlineErrors.message && <p className="text-red-500 text-xs">{inlineErrors.message.message}</p>}
              </div>

              <Button
                type="submit"
                disabled={isInlineSubmitting}
                className="w-full bg-teal-500 hover:bg-teal-400 text-black font-bold text-lg py-6 rounded-2xl shadow-[0_0_30px_rgba(20,184,166,0.2)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isInlineSubmitting ? "Submitting..." : "Submit — Get My Strategy Automated"}
              </Button>

              <p className="text-zinc-600 text-xs text-center leading-relaxed pt-2">
                TradingSmart.ai is a technology platform only — not a SEBI-registered adviser. We do not provide investment advice or execute trades. All decisions remain with the user.
              </p>
            </motion.form>
          )}
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

export default LandingPageNew;
