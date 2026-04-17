import React from 'react';
import { ScrollReveal } from '../ui/ScrollReveal';
import { BarChart3, FlaskConical, Rocket, Code2, Layers, Banknote } from 'lucide-react';

const InsideTheSoftware = () => {
    return (
        <section className="py-24 bg-black relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-900/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="container mx-auto px-4 relative z-10">
                <ScrollReveal>
                    <h2 className="text-4xl md:text-5xl font-bold mb-16 text-center text-white tracking-tight">
                        What Your Clients <span className="text-primary">Get</span>
                    </h2>
                </ScrollReveal>

                <div className="grid lg:grid-cols-3 gap-8">
                    {[
                        {
                            title: "01 - AI Trading Analysis",
                            desc: "Multi-strategy signal scoring on any stock. 7-factor validation engine covers market context, trend, signal strength, volume, volatility, risk-reward, and trap detection. Every entry gets a score, a grade, and a plain English reason.",
                            icon: <BarChart3 className="w-6 h-6 text-primary" />
                        },
                        {
                            title: "02 - Backtesting with AI Review",
                            desc: "Per-trade drill-down with entry price, exit price, indicator values at entry, and similar historical patterns. AI summary explains why the strategy worked or failed so users can verify the logic before risking capital.",
                            icon: <FlaskConical className="w-6 h-6 text-purple-400" />
                        },
                        {
                            title: "03 - Live Algo Deployment",
                            desc: "Strategy is coded by our engineers, AI validation is added, and it goes live on the client's broker within 72 hours. Full dashboard includes positions, orders, armed strategies, and a kill switch.",
                            icon: <Rocket className="w-6 h-6 text-green-400" />
                        }
                    ].map((feature, index) => (
                        <ScrollReveal key={index} delay={index * 0.1} direction="up">
                            <div className="h-full p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-all hover:bg-white/10 group">
                                <div className="p-3 bg-black rounded-xl border border-white/10 group-hover:border-cyan-500/30 transition-colors w-fit mb-6">
                                    {feature.icon}
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-primary transition-colors">
                                    {feature.title}
                                </h3>
                                <p className="text-gray-400 leading-relaxed">
                                    {feature.desc}
                                </p>
                            </div>
                        </ScrollReveal>
                    ))}
                </div>

                <ScrollReveal delay={0.35}>
                    <p className="mt-14 text-center text-gray-400 text-sm md:text-base max-w-3xl mx-auto leading-relaxed">
                        End users get the same full module set as your flagship story—analysis, backtests, strategies, options, paper/live—not a stripped reseller SKU. Your <span className="text-white font-medium">moat as a partner</span> is the same as ours: <span className="text-primary font-medium">custom algo integration</span> under your brand.
                    </p>
                </ScrollReveal>

                <ScrollReveal delay={0.45}>
                    <div className="mt-20 pt-16 border-t border-white/10">
                        <div className="flex items-center gap-3 mb-4 justify-center md:justify-start">
                            <span className="text-[10px] text-gray-500 tracking-[0.3em] uppercase font-medium">UNDER THE HOOD</span>
                        </div>
                        <h3 className="text-2xl md:text-3xl font-bold text-white mb-10 text-center md:text-left">
                            What else ships with the white-label stack
                        </h3>
                        <div className="grid md:grid-cols-3 gap-8">
                            {[
                                {
                                    title: 'Custom algo integration under your brand',
                                    desc: 'Your resale story matches the flagship: end users get engineering-led strategy implementation and deployment—not a DIY-only toolkit with hidden upsells.',
                                    icon: <Code2 className="w-6 h-6 text-primary" />
                                },
                                {
                                    title: 'Options + multi-asset hub',
                                    desc: 'Your clients get a trading dashboard that supports options strategy workflows alongside equities-style automation and monitoring—not a separate bolt-on product.',
                                    icon: <Layers className="w-6 h-6 text-purple-400" />
                                },
                                {
                                    title: 'Paper before live',
                                    desc: 'Let end users rehearse execution and discipline in paper mode, then graduate to live broker connectivity when they are ready.',
                                    icon: <Banknote className="w-6 h-6 text-green-400" />
                                }
                            ].map((row, i) => (
                                <div key={i} className="flex gap-4 p-6 rounded-2xl bg-white/[0.03] border border-white/10">
                                    <div className="p-3 bg-black rounded-xl border border-white/10 h-fit shrink-0">
                                        {row.icon}
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-bold text-white mb-2">{row.title}</h4>
                                        <p className="text-gray-400 text-sm leading-relaxed">{row.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </ScrollReveal>
            </div>
        </section>
    );
};

export default InsideTheSoftware;
