import React, { useState, useEffect, useRef, Suspense } from "react";
import { useForm, Controller } from "react-hook-form";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { Shield, Eye, Pause, Lock, BarChart3, FlaskConical, Code2, Layers } from "lucide-react";
import { Button } from "../components/ui/button";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
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
import { useToast } from "@/components/ui/use-toast";

gsap.registerPlugin(ScrollTrigger);

const DepthChart3DCanvas = React.lazy(
  () => import("../components/landingpage/aitrading/DepthChart3DCanvas")
);

// Framer motion variants
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

// HELPER COMPONENTS

const HowItWorksTimeline = () => {
  const steps = [
    "Subscribe and access your dashboard",
    "Our TradingSmart team contacts you after payment",
    "You share your strategy logic or requirements",
    "Our developers manually configure your strategy into the system",
    "Strategy is made available in your dashboard",
    "Run backtests and view analytical reports",
    "Optionally enable execution based on your own logic",
  ];

  return (
    <section className="py-24 bg-black border-t border-zinc-900 border-b">
      <div className="container mx-auto px-4 max-w-5xl">
        {/* Section header */}
        <div className="flex items-center gap-4 mb-20">
          <div className="w-3 h-3 rounded-full bg-teal-500 animate-pulse shrink-0" />
          <span className="text-xs text-zinc-500 tracking-[0.3em] uppercase">How It Works — 7 Steps</span>
          <div className="flex-1 h-px bg-zinc-900" />
        </div>

        {/* Steps — desktop alternating, mobile stacked */}
        <div className="relative">
          {/* Center spine — desktop only */}
          <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-zinc-900 -translate-x-1/2" />

          <div className="space-y-0">
            {steps.map((step, i) => {
              const isLeft = i % 2 === 0;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.55, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className={`relative flex items-center md:grid md:grid-cols-2 gap-0 mb-0`}
                >
                  {/* Center badge — desktop */}
                  <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 z-20 items-center justify-center w-12 h-12 bg-black border border-zinc-800 text-teal-500 font-bold text-sm tabular-nums shadow-[0_0_0_4px_#000,0_0_0_5px_rgba(45,212,191,0.15)]">
                    {String(i + 1).padStart(2, "0")}
                  </div>

                  {/* LEFT CARD (even steps) */}
                  {isLeft ? (
                    <>
                      <div className="hidden md:block md:pr-16 py-8 border-b border-zinc-900/50">
                        <div className="md:text-right">
                          <div className="hidden md:inline-block w-6 h-[2px] bg-teal-500 mb-5" />
                          <p className="text-lg text-zinc-200 font-light leading-relaxed">{step}</p>
                        </div>
                      </div>
                      <div className="hidden md:block py-8 border-b border-zinc-900/50" />
                    </>
                  ) : (
                    <>
                      <div className="hidden md:block py-8 border-b border-zinc-900/50" />
                      <div className="hidden md:block md:pl-16 py-8 border-b border-zinc-900/50">
                        <div className="w-6 h-[2px] bg-teal-500 mb-5" />
                        <p className="text-lg text-zinc-200 font-light leading-relaxed">{step}</p>
                      </div>
                    </>
                  )}

                  {/* MOBILE version — single column numbered list */}
                  <div className="md:hidden flex gap-5 items-start py-6 border-b border-zinc-900 col-span-2">
                    <div className="w-8 h-8 shrink-0 flex items-center justify-center border border-teal-500/30 text-teal-500 font-bold text-xs">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <p className="text-zinc-300 font-light leading-relaxed flex-1">{step}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};



const TerminalTypewriter = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });
  const [dispText, setDispText] = useState("");

  const fullText = `  $ init strategy --manual\n  > [✓] Configured manually by our team\n  > [✓] Built on user-provided or approved logic\n  > [✓] Supports complex rule-based conditions\n  > [✗] No automated strategy generation or suggestions\n  > This ensures accurate implementation of your logic.`;

  useEffect(() => {
    if (!isInView) return;
    let i = 0;
    const interval = setInterval(() => {
      setDispText(fullText.slice(0, i));
      i++;
      if (i > fullText.length) clearInterval(interval);
    }, 15);
    return () => clearInterval(interval);
  }, [isInView, fullText]);

  return (
    <section className="py-16 md:py-24 bg-black border-y border-zinc-900" ref={containerRef}>
      <div className="container mx-auto px-4 max-w-4xl">
         <h2 className="text-3xl sm:text-4xl md:text-5xl text-center text-white mb-8 md:mb-10 font-bebas">MANUAL CONFIGURATION</h2>
         <div className="bg-black border border-zinc-800 shadow-2xl relative overflow-hidden">
            <div className="h-8 bg-[#080808] flex items-center px-4 border-b border-zinc-800">
               <div className="flex gap-2">
                 <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
                 <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                 <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
               </div>
               <div className="absolute inset-x-0 text-center pointer-events-none hidden sm:block">
                 <span className="font-ibm-mono text-xs text-zinc-500">config.sh — bash</span>
               </div>
            </div>
            <div className="p-4 sm:p-6 md:p-10 min-h-[200px] md:min-h-[250px] font-ibm-mono text-[10px] sm:text-sm md:text-base text-teal-400 whitespace-pre-wrap break-all text-left overflow-x-auto">
               {dispText.split('\n').map((line, idx) => (
                 <div key={idx} className="mb-1">
                   {line.startsWith("  >") ? (
                     <span><span className="text-zinc-600">  {`>`} </span>{line.slice(4)}</span>
                   ) : (
                     line
                   )}
                 </div>
               ))}
               <span className="animate-pulse">_</span>
            </div>
         </div>
      </div>
    </section>
  );
};

const RadialHub = () => {
   const containerRef = useRef(null);
   
   return (
     <section className="py-32 bg-[#080808] border-t border-zinc-900 overflow-hidden relative">
       <div className="container mx-auto px-4 text-center">
         <h2 className="font-bebas text-5xl text-white mb-16 relative z-20">SECURITY & CONTROL</h2>
         
         {/* DESKTOP RADIAL */}
         <div className="hidden md:flex justify-center relative h-[500px]" ref={containerRef}>
            <div className="w-[500px] h-[500px] relative">
               
               {/* Center Node */}
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                  <div className="w-24 h-24 bg-black border border-teal-500/20 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(45,212,191,0.1)]">
                     <Shield className="w-10 h-10 text-teal-400 animate-pulse stroke-1" />
                  </div>
               </div>

               {/* Connecting lines bg */}
               <svg className="absolute inset-0 w-full h-full z-0 pointer-events-none radial-lines opacity-60">
                 <line x1="250" y1="250" x2="250" y2="40" stroke="rgba(45,212,191,0.15)" strokeWidth="2" strokeDasharray="4 4" className="stroke-dash-anim" />
                 <line x1="250" y1="250" x2="460" y2="250" stroke="rgba(45,212,191,0.15)" strokeWidth="2" strokeDasharray="4 4" className="stroke-dash-anim" />
                 <line x1="250" y1="250" x2="250" y2="460" stroke="rgba(45,212,191,0.15)" strokeWidth="2" strokeDasharray="4 4" className="stroke-dash-anim" />
                 <line x1="250" y1="250" x2="40" y2="250" stroke="rgba(45,212,191,0.15)" strokeWidth="2" strokeDasharray="4 4" className="stroke-dash-anim" />
               </svg>

               {/* 4 Nodes */}
               <motion.div initial={{ scale: 0.5, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }} viewport={{ once: true }} className="absolute top-[0] left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 text-center bg-black border border-zinc-800 p-4 z-10 shadow-xl">
                 <Lock className="w-5 h-5 text-zinc-500 m-auto mb-2 stroke-1" />
                 <p className="font-ibm-sans text-xs text-zinc-300">Users connect their own broker accounts</p>
               </motion.div>
               
               <motion.div initial={{ scale: 0.5, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }} viewport={{ once: true }} className="absolute top-1/2 right-[0] translate-x-1/2 -translate-y-1/2 w-48 text-center bg-black border border-zinc-800 p-4 z-10 shadow-xl">
                 <Shield className="w-5 h-5 text-zinc-500 m-auto mb-2 stroke-1" />
                 <p className="font-ibm-sans text-xs text-zinc-300">No access to user funds</p>
               </motion.div>

               <motion.div initial={{ scale: 0.5, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3 }} viewport={{ once: true }} className="absolute bottom-[0] left-1/2 -translate-x-1/2 translate-y-1/2 w-48 text-center bg-black border border-zinc-800 p-4 z-10 shadow-xl">
                 <Pause className="w-5 h-5 text-zinc-500 m-auto mb-2 stroke-1" />
                 <p className="font-ibm-sans text-xs text-zinc-300">Users can enable/disable execution anytime</p>
               </motion.div>

               <motion.div initial={{ scale: 0.5, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} transition={{ delay: 0.4 }} viewport={{ once: true }} className="absolute top-1/2 left-[0] -translate-x-1/2 -translate-y-1/2 w-48 text-center bg-black border border-zinc-800 p-4 z-10 shadow-xl">
                 <Eye className="w-5 h-5 text-zinc-500 m-auto mb-2 stroke-1" />
                 <p className="font-ibm-sans text-xs text-zinc-300">Full transparency of strategy logic</p>
               </motion.div>
            </div>
         </div>

         {/* MOBILE GRID */}
         <div className="md:hidden grid grid-cols-2 gap-4 mt-8">
            <div className="bg-black border border-zinc-800 p-6 flex flex-col items-center">
               <Lock className="w-8 h-8 text-teal-500 mb-4 stroke-1" />
               <p className="font-ibm-sans text-sm text-zinc-300">Users connect their own broker accounts</p>
            </div>
            <div className="bg-black border border-zinc-800 p-6 flex flex-col items-center">
               <Shield className="w-8 h-8 text-teal-500 mb-4 stroke-1" />
               <p className="font-ibm-sans text-sm text-zinc-300">No access to user funds</p>
            </div>
            <div className="bg-black border border-zinc-800 p-6 flex flex-col items-center">
               <Pause className="w-8 h-8 text-teal-500 mb-4 stroke-1" />
               <p className="font-ibm-sans text-sm text-zinc-300">Users can enable/disable execution anytime</p>
            </div>
            <div className="bg-black border border-zinc-800 p-6 flex flex-col items-center">
               <Eye className="w-8 h-8 text-teal-500 mb-4 stroke-1" />
               <p className="font-ibm-sans text-sm text-zinc-300">Full transparency of strategy logic</p>
            </div>
         </div>

       </div>
       <style>{`
         @keyframes dash {
           to { stroke-dashoffset: -16; }
         }
         .stroke-dash-anim {
           animation: dash 1s linear infinite;
         }
       `}</style>
     </section>
   );
};


// MAIN COMPONENT

const AiTradingAnalysisPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isEnquiryModalOpen, setIsEnquiryModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { handleSubmit, register, control, reset } = useForm();
  
  const [activeTab, setActiveTab] = useState("PLATFORM");

  useEffect(() => {
    document.body.classList.add("cursor-crosshair", "bg-black", "text-white");
    return () => {
      document.body.classList.remove("cursor-crosshair", "bg-black", "text-white");
    };
  }, []);

  const handleFormSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("contact_inquiries").insert([{
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        message: data.message || null,
        inquiry_type: data.inquiry_type || 'algorithms',
        page_source: "ai-trading-analysis",
      }]);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Your inquiry has been submitted. Our team will contact you shortly.",
      });
      setIsEnquiryModalOpen(false);
      reset();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit inquiry",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    // Stagger animation for hero lines
    const ctx = gsap.context(() => {
      gsap.fromTo(".hero-line-anim", 
        { y: 80, opacity: 0 }, 
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.15, ease: "power3.out", delay: 0.5 }
      );
      gsap.fromTo(".hero-rule",
        { scaleX: 0 },
        { scaleX: 1, duration: 1, ease: "power2.inOut", delay: 1.2 }
      );
    });
    return () => ctx.revert();
  }, []);

  return (
    <div className="bg-black min-h-screen overflow-x-hidden font-ibm-sans selection:bg-teal-500/30 selection:text-teal-400">
      <Helmet>
        <title>Platform tour: analysis, backtests, strategies &amp; execution | TradingSmart.ai</title>
        <meta
          name="description"
          content="Built as a suite: AI-assisted analysis, backtesting, strategy workspace, and options plus paper/live execution in one stack. Full modules for every subscriber—custom algo integration is how we operationalize your logic."
        />
      </Helmet>

      {/* CRT Scanline Overlay */}
      {/* <div className="fixed inset-0 pointer-events-none z-[9998] opacity-[0.15]" 
           style={{ background: "repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0,0,0,1) 3px, rgba(0,0,0,1) 4px)" }} /> */}

      <AiPredictionHeader />

      {/* HERO SCENE */}
      <section className="relative min-h-[100svh] flex items-end md:items-center pb-16 md:pb-0 pt-20 overflow-hidden bg-[#000000] border-b border-zinc-900">
        <Suspense fallback={<div className="absolute inset-0 bg-black" />}>
           <DepthChart3DCanvas />
        </Suspense>
        
        {/* HUD OVERLAY — desktop only */}
        <div className="hidden md:flex absolute inset-0 z-20 pointer-events-none p-10 flex-col justify-between">
           <div className="flex justify-between w-full">
              <div className="font-ibm-mono text-[10px] text-teal-500/50 flex gap-2">
                 <span>BID ████ ASK</span>
                 <span className="animate-pulse opacity-50">_</span>
              </div>
              <div className="font-ibm-mono text-xs text-zinc-600">
                 <LiveClock />
              </div>
           </div>
           <div className="flex justify-end w-full">
              <div className="text-right font-ibm-mono text-xs text-zinc-600 flex flex-col gap-1 items-end">
                 <span>LATENCY: {"<"}72H</span>
                 <span className="flex items-center gap-2">STATUS: <span className="w-2 h-2 rounded-full bg-teal-400"></span>LIVE</span>
              </div>
           </div>
        </div>

        <div className="container mx-auto px-4 z-30 relative">
          <div className="grid md:grid-cols-1 gap-8 items-center">
             {/* Left Text content */}
             <div className="md:pr-10">
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[4.5rem] leading-[1.05] md:leading-[0.95] text-white tracking-wide mb-6 drop-shadow-lg">
                   <div className="overflow-hidden"><div className="hero-line-anim">Backtest Your Strategy.</div></div>
                   <div className="overflow-hidden"><div className="hero-line-anim">Understand Every Trade.</div></div>
                   <div className="overflow-hidden"><div className="hero-line-anim">Execute With Your Own Logic.</div></div>
                </h1>
                
                <div className="hero-rule h-px bg-teal-500/50 w-full max-w-[80%] origin-left mb-6" />

                <p className="font-ibm-sans font-light text-zinc-400 text-lg md:text-xl mb-12 max-w-lg leading-relaxed">
                  Backtests and AI-assisted analysis are the headline—but the same subscription includes strategies, options workflows, and paper-to-live execution. We integrate your logic into this stack.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <Button
                    onClick={() => navigate(user ? "/backtest" : "/auth")}
                    className="w-full sm:w-auto font-ibm-mono rounded-none bg-teal-500 hover:bg-teal-400 text-black font-bold uppercase tracking-wider px-8 py-6 h-auto"
                  >
                    Start Backtesting
                  </Button>
                  <Button
                    onClick={() => setIsEnquiryModalOpen(true)}
                    variant="outline"
                    className="w-full sm:w-auto font-ibm-mono rounded-none border border-zinc-700 bg-transparent hover:bg-zinc-900 text-white uppercase tracking-wider px-8 py-6 h-auto"
                  >
                    Book Demo
                  </Button>
                </div>
             </div>
             {/* Right half is empty to let 3D canvas shine */}
          </div>
        </div>

        <div className="hidden md:block absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
          <div className="font-ibm-mono text-[10px] tracking-[0.3em] text-zinc-600 bounce-anim">
            ▼ SCROLL TO EXPLORE
          </div>
        </div>
        <style>{`
          @keyframes bnce { 0%, 100% {transform: translateY(0)} 50% {transform: translateY(8px)} }
          .bounce-anim { animation: bnce 2s infinite ease-in-out; }
        `}</style>
      </section>

      {/* 3 TABS SECTION */}
      <section className="py-24 bg-[#080808] border-b border-zinc-900 overflow-hidden">
        <div className="container mx-auto px-4 max-w-6xl">
           
           {/* Tab Bar */}
           <div className="flex overflow-x-auto border-b border-zinc-800 no-scrollbar hide-scroll">
              {["PLATFORM", "ANALYSIS", "EXECUTION"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-8 py-4 font-ibm-mono text-[11px] uppercase tracking-widest whitespace-nowrap transition-colors ${
                    activeTab === tab ? "border-b-2 border-teal-500 text-white" : "text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {tab}
                </button>
              ))}
           </div>

           {/* Tab Content */}
           <div className="bg-[#080808] border border-t-0 border-zinc-800 rounded-none p-8 md:p-14 min-h-[360px] relative">
              <AnimatePresence mode="wait">
                {activeTab === "PLATFORM" && (
                  <motion.div
                    key="tab1"
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col h-full"
                  >
                     <h2 className="text-2xl md:text-4xl leading-tight text-white mb-4">WHAT THIS PLATFORM DOES</h2>
                     <p className="font-ibm-sans text-teal-400 mb-2 font-light">Technology for Strategy Testing & Analysis</p>
                     <p className="font-ibm-sans text-zinc-400 mb-8">This platform provides tools to simulate and analyze user-defined trading strategies.</p>
                     
                     <div className="flex-1 mb-8">
                       <table className="w-full text-left font-ibm-sans text-zinc-300">
                         <tbody>
                           {[
                             "Backtest any user-defined strategy",
                             "Test across any timeframe (days, months, years)",
                             "Run multiple simulations",
                             "Generate detailed trade-level reports",
                             "Analyze historical performance behavior"
                           ].map((item, i) => (
                             <tr key={i} className={i % 2 === 0 ? "bg-white/[0.01]" : ""}>
                               <td className="font-ibm-mono text-teal-500 text-xs py-3 pl-4 w-12 border-l-2 border-teal-500/20">0{i+1}</td>
                               <td className="py-3 pr-4 border-b border-zinc-900/50">{item}</td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                     <p className="font-ibm-mono text-xs text-zinc-600 uppercase tracking-wide">
                        This is a data and infrastructure platform — not an advisory service.
                     </p>
                  </motion.div>
                )}

                {activeTab === "ANALYSIS" && (
                  <motion.div
                    key="tab2"
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col h-full"
                  >
                     <h2 className="text-2xl md:text-4xl leading-tight text-white mb-4 uppercase">TRADE-BY-TRADE ANALYSIS <span className="text-teal-500 text-lg md:text-2xl ml-1 tracking-normal">(AI-ASSISTED)</span></h2>
                     <p className="font-ibm-sans text-zinc-400 mb-8">The system processes your strategy outputs and generates analytical insights.</p>
                     
                     <div className="flex-1 mb-8">
                       <table className="w-full text-left font-ibm-sans text-zinc-300">
                         <tbody>
                           {[
                             "Outcome of each entry based on historical data",
                             "Profit/loss distribution across trades",
                             "Duration and exposure analysis",
                             "Drawdown patterns",
                             "Performance variation across market conditions"
                           ].map((item, i) => (
                             <tr key={i} className={i % 2 === 0 ? "bg-white/[0.01]" : ""}>
                               <td className="font-ibm-mono text-teal-500 text-xs py-3 pl-4 w-12 border-l-2 border-teal-500/20">0{i+1}</td>
                               <td className="py-3 pr-4 border-b border-zinc-900/50">{item}</td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                     <p className="font-ibm-mono text-xs text-zinc-600 uppercase tracking-wide">
                        AI is used only to analyze patterns and present structured reports.
                     </p>
                  </motion.div>
                )}

                {activeTab === "EXECUTION" && (
                  <motion.div
                    key="tab3"
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col h-full"
                  >
                     <h2 className="text-2xl md:text-4xl leading-tight text-white mb-4 uppercase">STRATEGY-BASED EXECUTION <span className="text-amber-400 text-lg md:text-2xl ml-1 tracking-normal">(USER CONTROLLED)</span></h2>
                     
                     <div className="flex-1 mb-8 mt-6">
                       <table className="w-full text-left font-ibm-sans text-zinc-300">
                         <tbody>
                           {[
                             "Execution is based strictly on your defined strategy",
                             "System follows logic provided or approved by you",
                             "You control activation, modification, and stopping"
                           ].map((item, i) => (
                             <tr key={i} className={i % 2 === 0 ? "bg-white/[0.01]" : ""}>
                               <td className="font-ibm-mono text-teal-500 text-xs py-4 pl-4 w-12 border-l-2 border-teal-500/20">0{i+1}</td>
                               <td className="py-4 pr-4 border-b border-zinc-900/50 text-lg">{item}</td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>

                     <div className="border-l-4 border-amber-400 bg-amber-400/5 pl-6 py-4 mt-auto">
                        <p className="font-bebas text-2xl text-amber-500 mb-2 tracking-wide">Important:</p>
                        <p className="font-ibm-sans text-sm text-zinc-300 mb-1">We do NOT provide stock tips, buy/sell signals, or trading recommendations.</p>
                        <p className="font-ibm-sans text-sm text-zinc-300">The platform does not suggest trades — it only processes user-defined strategies.</p>
                     </div>
                  </motion.div>
                )}
              </AnimatePresence>
           </div>
        </div>
      </section>

      {/* FULL PLATFORM SUITE */}
      <section className="py-24 bg-black border-b border-zinc-900">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
          >
            <motion.h2 variants={fadeUp} className="font-bebas text-4xl md:text-5xl text-white mb-4 text-center md:text-left">
              Built as a suite—not a single screen
            </motion.h2>
            <motion.p variants={fadeUp} className="font-ibm-sans text-zinc-400 text-lg max-w-3xl mb-12 text-center md:text-left leading-relaxed">
              Analysis and backtesting anchor the story, but they are not gated extras:{" "}
              <span className="text-zinc-200 font-medium">every subscriber</span> gets the same modules traders use before and after they trade. The reason teams choose us is{" "}
              <span className="text-zinc-200 font-medium">custom algo integration</span>
              —we operationalize your logic inside this stack.
            </motion.p>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  icon: BarChart3,
                  title: "AI trading analysis",
                  body: "Score and validate setups with structured factors and readable explanations. Use it to sanity-check ideas before size or automation.",
                  cta: "Explore analysis",
                  path: "/ai-trading-analysis",
                },
                {
                  icon: FlaskConical,
                  title: "Backtesting lab",
                  body: "Replay rules on history with trade-by-trade detail and AI-assisted review so users understand what drove outcomes.",
                  cta: "Open backtests",
                  path: "/backtest",
                },
                {
                  icon: Code2,
                  title: "Strategy builder",
                  body: "Create and manage algo rules, presets, and deployment-ready configurations in one strategies workspace—then lean on our team when you need bespoke logic wired for production.",
                  cta: "View strategies",
                  path: "/strategies",
                },
                {
                  icon: Layers,
                  title: "Options & execution hub",
                  body: "Options strategies and live or paper workflows live in the trading dashboard—positions, orders, and controls in one place.",
                  cta: "See trading hub",
                  path: "/trading-dashboard",
                },
              ].map((card, i) => {
                const Icon = card.icon;
                return (
                  <motion.div
                    key={card.title}
                    variants={fadeUp}
                    className="border border-zinc-800 bg-[#080808] p-6 md:p-8 flex flex-col"
                  >
                    <Icon className="w-8 h-8 text-teal-500 mb-4 stroke-1" />
                    <h3 className="font-bebas text-2xl text-white mb-3 tracking-wide">{card.title}</h3>
                    <p className="font-ibm-sans text-zinc-400 text-sm leading-relaxed flex-1 mb-6">{card.body}</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        user
                          ? navigate(card.path)
                          : navigate(`/auth?redirect=${encodeURIComponent(card.path)}`)
                      }
                      className="font-ibm-mono rounded-none border-teal-500/40 text-teal-400 hover:bg-teal-500/10 w-full sm:w-auto self-start uppercase tracking-wider"
                    >
                      {card.cta}
                    </Button>
                  </motion.div>
                );
              })}
            </div>

            <motion.p variants={fadeUp} className="mt-10 text-[11px] text-zinc-600 font-ibm-sans max-w-3xl leading-relaxed">
              Full platform modules are included for every subscriber; live order flow still requires a supported broker connection where applicable. Nothing here is investment advice or a promise of results.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <HowItWorksTimeline />

      {/* MANUAL CONFIGURATION */}
      <TerminalTypewriter />

      {/* WHY / WHO DATA TABLES */}
      <section className="py-24 bg-[#080808] border-b border-zinc-900">
         <div className="container mx-auto px-4 max-w-6xl">
            <div className="grid md:grid-cols-2 gap-16">
               
               {/* WHY */}
               <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer}>
                 <h2 className="font-bebas text-4xl text-white mb-6">WHY THIS PLATFORM</h2>
                 <table className="w-full text-left font-ibm-sans text-zinc-300 border-collapse">
                   <tbody>
                     {[
                       "No coding required from user",
                       "User-defined strategy only",
                       "Manual configuration for quality",
                       "Detailed analytical reporting",
                       "Full user control at all times"
                     ].map((item, i) => (
                       <motion.tr variants={fadeUp} key={i} className={i % 2 === 0 ? "bg-white/[0.01]" : ""}>
                         <td className="font-ibm-mono text-teal-500 text-xs py-4 pl-4 w-12 border-l-2 border-teal-500/20">0{i+1}</td>
                         <td className="py-4 pr-4 border-b border-zinc-900/50">{item}</td>
                       </motion.tr>
                     ))}
                   </tbody>
                 </table>
               </motion.div>

               {/* WHO */}
               <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer}>
                 <h2 className="font-bebas text-4xl text-white mb-6">WHO IS THIS FOR</h2>
                 <table className="w-full text-left font-ibm-sans text-zinc-300 border-collapse">
                   <tbody>
                     {[
                       "Individuals testing their own trading strategies",
                       "Traders analyzing rule-based systems",
                       "Users seeking structured backtesting tools",
                       "Anyone looking for execution infrastructure (non-advisory)"
                     ].map((item, i) => (
                       <motion.tr variants={fadeUp} key={i} className={i % 2 === 0 ? "bg-white/[0.01]" : ""}>
                         <td className="font-ibm-mono text-amber-400/60 text-xs py-4 pl-4 w-12 border-l-2 border-amber-400/20">0{i+1}</td>
                         <td className="py-4 pr-4 border-b border-zinc-900/50">{item}</td>
                       </motion.tr>
                     ))}
                   </tbody>
                 </table>
               </motion.div>
               
            </div>
         </div>
      </section>

      <section className="pt-16 md:pt-32 bg-black border-b border-zinc-900">
        <TradingSmartPricingMatrix />
      </section>

      {/* SECURITY RADIAL */}
      <RadialHub />

      {/* DISCLAIMER CODE BLOCK */}
      <section className="bg-black border-y border-zinc-900/50 py-16">
        <div className="container mx-auto px-4 max-w-4xl text-center">
           <div className="font-ibm-mono text-sm text-zinc-500 leading-[2] tracking-wide text-left inline-block bg-[#020202] p-8 border border-zinc-900 shadow-2xl">
             <p className="text-zinc-600 font-bold mb-4">// DISCLAIMER</p>
             <p>// TradingSmart.ai is a technology platform offering tools for backtesting, execution infrastructure, and data analysis.</p>
             <p>// We do not provide investment advice, stock recommendations, portfolio management, or trading tips.</p>
             <p>// All strategies are defined, provided, or approved by the user.</p>
             <p>// All trading decisions and associated risks are solely the responsibility of the user.</p>
           </div>
        </div>
      </section>

      {/* START NOW GRID CSS DRIFT */}
      <section className="relative min-h-[100svh] flex flex-col items-center justify-center overflow-hidden bg-black text-center py-20 border-t border-zinc-900">
        
        {/* CSS GRID BG */}
        <div className="absolute inset-0 pointer-events-none drift-bg opacity-40 z-0 mix-blend-screen" />
        
        <div className="relative z-10 container mx-auto px-4">
           <h2 className="text-5xl sm:text-7xl md:text-[clamp(4rem,10vw,9rem)] text-white mb-6 leading-none">START NOW</h2>
           <p className="font-ibm-sans font-light text-zinc-400 text-xl max-w-xl mx-auto mb-16">
             Test your logic. Analyze your results. Execute your strategy.
           </p>

           <div className="bg-[#080808] border border-zinc-800 p-6 md:p-10 text-left font-ibm-mono text-xs md:text-sm text-zinc-500 max-w-md mx-auto mb-16 shadow-2xl">
             <div className="flex justify-between mb-4"><span>STATUS</span> <span className="text-zinc-700">..............</span> <span className="text-teal-400 font-bold">READY</span></div>
             <div className="flex justify-between mb-4"><span>LATENCY</span> <span className="text-zinc-700">.............</span> <span className="text-teal-400 font-bold">{"<"} 72H</span></div>
             <div className="flex justify-between mb-4"><span>STRATEGY CONFIG</span> <span className="text-zinc-700">.....</span> <span className="text-teal-400 font-bold">MANUAL</span></div>
             <div className="flex justify-between"><span>ADVISORY</span> <span className="text-zinc-700">............</span> <span className="text-teal-400 font-bold">NONE</span></div>
           </div>

           <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
             <Button
                onClick={() => setIsEnquiryModalOpen(true)}
                className="font-ibm-mono rounded-none border-2 border-teal-500 bg-transparent text-teal-400 hover:bg-teal-500 hover:text-black font-bold tracking-widest px-10 py-7 uppercase w-full sm:w-auto h-auto transition-all"
             >
                Start Backtesting Now
             </Button>
             <Button
                onClick={() => setIsEnquiryModalOpen(true)}
                className="font-ibm-mono rounded-none border border-zinc-700 bg-transparent text-zinc-400 hover:border-zinc-500 hover:text-white font-bold tracking-widest px-10 py-7 uppercase w-full sm:w-auto h-auto transition-all"
             >
                Talk to Our Team
             </Button>
           </div>
        </div>

        <style>{`
          .drift-bg {
            background-image: 
              linear-gradient(rgba(45,212,191,0.04) 1px, transparent 1px), 
              linear-gradient(90deg, rgba(45,212,191,0.04) 1px, transparent 1px);
            background-size: 80px 80px;
            background-position: 0 0;
            animation: gridDrift 12s linear infinite;
          }
          @keyframes gridDrift {
            from { background-position: 0 0; }
            to { background-position: 80px 80px; }
          }
        `}</style>
      </section>

      <AiPredictionFooter />

      {/* FIXED Enquiry Modal */}
      <Dialog open={isEnquiryModalOpen} onOpenChange={setIsEnquiryModalOpen}>
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden bg-black border border-white/10 rounded-3xl">
          <div className="p-8">
            <DialogTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-600 mb-6 font-bebas tracking-wide">
              Book a Demo / Enquiry
            </DialogTitle>

            <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-zinc-400 font-ibm-sans">Full Name *</Label>
                  <Input
                    id="name"
                    {...register("name", { required: true })}
                    className="bg-black/50 border-white/10 focus:border-teal-500/50 text-white rounded-xl placeholder:text-zinc-600 font-ibm-mono"
                    placeholder="Enter your name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-zinc-400 font-ibm-sans">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    {...register("email", { required: "Email is required" })}
                    className="bg-black/50 border-white/10 focus:border-teal-500/50 text-white rounded-xl placeholder:text-zinc-600 font-ibm-mono"
                    placeholder="Enter your email address"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-zinc-400 font-ibm-sans">Phone Number (Optional)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    {...register("phone")}
                    className="bg-black/50 border-white/10 focus:border-teal-500/50 text-white rounded-xl placeholder:text-zinc-600 font-ibm-mono"
                    placeholder="Enter your phone number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inquiry_type" className="text-zinc-400 font-ibm-sans">Topic *</Label>
                  <Controller
                    name="inquiry_type"
                    control={control}
                    defaultValue="algorithms"
                    render={({ field }) => (
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <SelectTrigger className="bg-black/50 border-white/10 focus:border-teal-500/50 text-white rounded-xl font-ibm-mono">
                          <SelectValue placeholder="Select a topic" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-white font-ibm-mono">
                          <SelectItem value="algorithms">Algorithm Integration</SelectItem>
                          <SelectItem value="white-label">White-label Solution</SelectItem>
                          <SelectItem value="data">Data & APIs</SelectItem>
                          <SelectItem value="other">Other Inquiry</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message" className="text-zinc-400 font-ibm-sans">Message (Optional)</Label>
                <Textarea
                  id="message"
                  {...register("message")}
                  rows={4}
                  className="bg-black/50 border-white/10 focus:border-teal-500/50 text-white rounded-xl resize-none placeholder:text-zinc-600 font-ibm-mono"
                  placeholder="Tell us more about your needs..."
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-6 rounded-xl font-ibm-mono disabled:opacity-50 tracking-wider"
              >
                {isSubmitting ? "Submitting..." : "Submit Enquiry"}
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Clock helper component
const LiveClock = () => {
   const [time, setTime] = useState(new Date().toLocaleTimeString());
   useEffect(() => {
      const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
      return () => clearInterval(id);
   }, []);
   return <>{time}</>;
}

export default AiTradingAnalysisPage;
