import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3,
  FlaskConical,
  Code2,
  Layers,
  Banknote,
  Zap,
} from "lucide-react";
import AiPredictionHeader from "@/components/landingpage/mainlandingpage/AiPredictionHeader";
import AiPredictionFooter from "@/components/landingpage/mainlandingpage/AiPredictionFooter";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const TILES = [
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
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-teal-500/30 selection:text-teal-100 overflow-x-hidden">
      <Helmet>
        <title>Full platform modules | TradingSmart.ai</title>
        <meta
          name="description"
          content="Analysis, backtests, strategies, options, paper and live execution—same surface for every subscriber. Custom algo integration is how we ship your logic to production."
        />
      </Helmet>
      <AiPredictionHeader />
      <main className="pt-32 pb-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="mb-12 text-center md:text-left"
          >
            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-2 text-[11px] text-zinc-500 tracking-[0.3em] uppercase font-medium mb-4"
            >
              FULL PLATFORM
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="text-3xl md:text-5xl font-black text-white font-syne tracking-tight max-w-4xl"
            >
              One workspace for analysis, backtests, strategies, options, and execution
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-4 text-white text-base md:text-lg font-semibold max-w-3xl"
            >
              Your edge isn&apos;t a locked feature. It&apos;s the support you get from our team to
              integrate your strategy into a live, broker-ready stack.
            </motion.p>
            <motion.p variants={fadeUp} className="mt-6 text-zinc-400 text-base max-w-3xl leading-relaxed">
              Every subscriber gets the same product surface. Plans differ on commercial terms (billing,
              support, seats)—not on turning major modules off.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            variants={stagger}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {TILES.map((item) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  variants={fadeUp}
                  className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.08] hover:border-teal-500/25 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-teal-400" strokeWidth={1.5} />
                  </div>
                  <h2 className="text-white font-semibold text-sm mb-2">{item.title}</h2>
                  <p className="text-zinc-400 text-sm font-light leading-relaxed">{item.body}</p>
                </motion.div>
              );
            })}
          </motion.div>

          <div className="flex flex-col sm:flex-row gap-4 mt-14 justify-center md:justify-start">
            <Link
              to="/ai-trading-analysis-and-back-testing"
              className="inline-flex items-center justify-center px-8 py-3.5 bg-teal-500 text-black font-bold rounded-full hover:bg-teal-400 transition-colors text-sm font-syne"
            >
              Platform tour
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center px-8 py-3.5 border border-teal-500/40 text-teal-400 font-bold rounded-full hover:bg-teal-500/10 transition-colors text-sm font-syne"
            >
              View pricing
            </Link>
          </div>
        </div>
      </main>
      <AiPredictionFooter />
    </div>
  );
}
