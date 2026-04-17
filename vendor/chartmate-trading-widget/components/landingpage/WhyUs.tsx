import React from 'react';
import { Code2, Layers, FlaskConical } from 'lucide-react';
import { ScrollReveal } from '../ui/ScrollReveal';

const reasons = [
    {
        icon: <Code2 className="w-12 h-12 text-purple-400 mb-6" />,
        title: "Custom algo integration",
        description:
            "You describe the strategy; our engineers implement, validate, and wire broker paths—so your users get production-ready automation, not a DIY-only toolkit.",
        bg: "bg-secondary/10",
        border: "border-secondary/30",
        shadow: "shadow-[0_0_30px_rgba(168,85,247,0.2)]",
    },
    {
        icon: <Layers className="w-12 h-12 text-primary mb-6" />,
        title: "Same surface for every subscriber",
        description:
            "Analysis, backtests, strategies, options workspace, and paper-to-live tracking are included for all paid plans. Tiers differ on commercial terms—not locked modules.",
        bg: "bg-cyan-500/10",
        border: "border-cyan-500/30",
        shadow: "shadow-[0_0_30px_rgba(34,211,238,0.2)]",
    },
    {
        icon: <FlaskConical className="w-12 h-12 text-blue-400 mb-6" />,
        title: "Prove workflows before live capital",
        description:
            "Backtests with per-trade detail and paper mode let users validate discipline and process before connecting live brokers—transparent tooling, not black-box signals.",
        bg: "bg-primary/10",
        border: "border-primary/30",
        shadow: "shadow-[0_0_30px_rgba(59,130,246,0.2)]",
    },
];

const WhyUs = () => {
    return (
        <section className="py-16 bg-zinc-950 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-900/10 to-black pointer-events-none"></div>

            <div className="container mx-auto px-4 relative z-10">
                <ScrollReveal>
                    <div className="text-center max-w-3xl mx-auto mb-20">
                        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">
                            Why teams choose{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-primary">
                                TradingSmart
                            </span>
                        </h2>
                        <p className="text-xl text-gray-400 leading-relaxed font-light">
                            A technology platform for user-defined strategies—execution infrastructure, structured analysis, and engineering-led integration under your brand.
                        </p>
                    </div>
                </ScrollReveal>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {reasons.map((reason, index) => (
                        <ScrollReveal key={index} delay={index * 0.2} direction="up">
                            <div
                                className={`bg-black/50 p-10 rounded-3xl border ${reason.border} hover:-translate-y-2 transition-all duration-300 ${reason.shadow} backdrop-blur-sm h-full`}
                            >
                                <div className={`inline-block p-4 rounded-2xl ${reason.bg} mb-6`}>{reason.icon}</div>
                                <h3 className="text-2xl font-bold text-white mb-4">{reason.title}</h3>
                                <p className="text-gray-400 leading-relaxed font-light">{reason.description}</p>
                            </div>
                        </ScrollReveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default WhyUs;
