import React from 'react';
import { Target, Zap, Bot, History } from 'lucide-react';
import { ScrollReveal } from '../ui/ScrollReveal';

const reasons = [
    {
        icon: <Target className="w-12 h-12 text-primary mb-6" />,
        title: "AI Trading Analysis That Traders Understand",
        description: "Your users get signal scoring, structured validation factors, and plain English reasoning on every setup so confidence comes from transparency, not hype.",
        bg: "bg-cyan-500/10",
        border: "border-cyan-500/30",
        shadow: "shadow-[0_0_30px_rgba(34,211,238,0.2)]"
    },
    {
        icon: <Zap className="w-12 h-12 text-yellow-400 mb-6" />,
        title: "Execution-Ready Platform, 24/7",
        description: "Give your traders always-on monitoring, clean workflows, and broker-connected execution tools inside a single branded experience.",
        bg: "bg-yellow-500/10",
        border: "border-yellow-500/30",
        shadow: "shadow-[0_0_30px_rgba(234,179,8,0.2)]"
    },
    {
        icon: <Bot className="w-12 h-12 text-purple-400 mb-6" />,
        title: "Expert-Led Automation",
        description: "Your clients tell us their strategy. Our engineers code it, add an AI validation layer, and deploy it live on their broker in 72 hours - under your brand.",
        bg: "bg-secondary/10",
        border: "border-secondary/30",
        shadow: "shadow-[0_0_30px_rgba(168,85,247,0.2)]"
    },
    {
        icon: <History className="w-12 h-12 text-green-400 mb-6" />,
        title: "Proof Before Profit",
        description: "Your users can backtest any strategy against historical data with per-trade breakdowns - entry, exit, indicator values, and AI-generated plain English reasoning. They see the math work before risking a dollar.",
        bg: "bg-green-500/10",
        border: "border-green-500/30",
        shadow: "shadow-[0_0_30px_rgba(34,197,94,0.2)]"
    }
];

const WhyUs = () => {
    return (
        <section className="py-16 bg-zinc-950 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-900/10 to-black pointer-events-none"></div>

            <div className="container mx-auto px-4 relative z-10">
                <ScrollReveal>
                    <div className="text-center max-w-3xl mx-auto mb-20">
                        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">
                            A Product Your Traders <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-primary">Will Never Leave</span>
                        </h2>
                        <p className="text-xl text-gray-400 leading-relaxed font-light">
                            We built the workflows traders use every day. When you white-label this platform, you offer the same full module set as our flagship—analysis, backtests, strategies, options, paper/live—with custom algo integration as your differentiated story.
                        </p>
                    </div>
                </ScrollReveal>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {reasons.map((reason, index) => (
                        <ScrollReveal key={index} delay={index * 0.2} direction="up">
                            <div className={`bg-black/50 p-8 rounded-3xl border ${reason.border} hover:-translate-y-2 transition-all duration-300 ${reason.shadow} backdrop-blur-sm h-full`}>
                                <div className={`inline-block p-4 rounded-2xl ${reason.bg} mb-6`}>
                                    {reason.icon}
                                </div>
                                <h3 className="text-xl font-bold text-white mb-4 leading-tight">
                                    {reason.title}
                                </h3>
                                <p className="text-gray-400 leading-relaxed font-light text-sm">
                                    {reason.description}
                                </p>
                            </div>
                        </ScrollReveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default WhyUs;
