import React from 'react';
import { FaNetworkWired, FaChartBar, FaLayerGroup, FaBrain } from 'react-icons/fa';
import { BiCctv } from 'react-icons/bi';
import { ScrollReveal } from '../ui/ScrollReveal';

const HowItWorks = () => {
    return (
        <section id="how-it-works" className="py-16 bg-zinc-950/30 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-900/10 to-black pointer-events-none"></div>
            <div className="container mx-auto px-4 relative z-10">
                <ScrollReveal>
                    <h2 className="text-4xl md:text-6xl font-bold mb-24 text-center text-white">How It Works</h2>
                </ScrollReveal>

                <div className="relative">
                    {/* Connecting Line (Desktop) */}
                    <div className="hidden md:block absolute top-10 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-900 to-transparent z-0"></div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-12">
                        {[
                            { title: "Data Ingestion", icon: <FaNetworkWired />, desc: "Real-time price & volume data" },
                            { title: "Pattern Recog.", icon: <FaChartBar />, desc: "Identifies complex structures" },
                            { title: "Strategy Match", icon: <FaLayerGroup />, desc: "Trend, scalp, or swing logic" },
                            { title: "Analysis", icon: <FaBrain />, desc: "Probability score generation", highlight: true },
                            { title: "Self Learning", icon: <BiCctv />, desc: "Adapts to new market behavior" }
                        ].map((step, i) => (
                            <ScrollReveal key={i} delay={i * 0.15} direction="up">
                                <div className={`relative z-10 flex flex-col items-center text-center group`}>
                                    <div className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl mb-8 transition-all duration-500 border-4 ${step.highlight ? 'bg-black border-cyan-500 text-primary shadow-[0_0_50px_rgba(6,182,212,0.4)] scale-110' : 'bg-black border-zinc-800 text-gray-500 group-hover:border-white/20 group-hover:text-white'}`}>
                                        {step.icon}
                                    </div>
                                    <h3 className={`text-xl font-bold mb-3 ${step.highlight ? 'text-primary' : 'text-white'}`}>{step.title}</h3>
                                    <p className="text-sm text-gray-500 leading-relaxed max-w-[180px]">{step.desc}</p>
                                </div>
                            </ScrollReveal>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HowItWorks;
