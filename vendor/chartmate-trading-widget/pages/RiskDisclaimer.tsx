import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaExclamationTriangle } from 'react-icons/fa';
import Layout from '../components/landingpage/Layout';
import { ScrollReveal } from '../components/ui/ScrollReveal';

const RiskDisclaimer = () => {
    return (
        <Layout>
            <div className="min-h-screen bg-black text-white font-sans selection:bg-red-500 selection:text-black">
                <Helmet>
                    <title>Risk Disclaimer | Boostmysites</title>
                    <meta name="description" content="Risk Disclaimer for Boostmysites platform. Understand the risks involved in trading financial instruments." />
                </Helmet>

                {/* Hero Section */}
                <section className="relative pt-40 pb-20 px-4 overflow-hidden border-b border-white/5">
                    <div className="absolute inset-0 bg-gradient-to-b from-red-900/20 to-black pointer-events-none"></div>
                    <div className="container mx-auto relative z-10">
                        <ScrollReveal>
                            <Link
                                to="/"
                                className="inline-flex items-center gap-2 text-red-400 hover:text-red-300 mb-8 transition-colors"
                            >
                                <FaArrowLeft /> Back to Home
                            </Link>
                            <div className="flex items-center gap-6 mb-6">
                                <div className="p-5 bg-red-500/10 rounded-2xl border border-red-500/20 backdrop-blur-sm">
                                    <FaExclamationTriangle className="text-4xl text-red-400" />
                                </div>
                                <div>
                                    <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white mb-2">Risk Disclaimer</h1>
                                    <p className="text-red-400 font-bold uppercase tracking-wider text-sm">Read this carefully. Ignoring this is your responsibility.</p>
                                </div>
                            </div>
                        </ScrollReveal>
                    </div>
                </section>

                {/* Warning Banner */}
                <section className="py-8 px-4 bg-red-950/30 border-y border-red-500/20">
                    <div className="container mx-auto max-w-4xl">
                        <div className="text-center">
                            <p className="text-red-300 text-lg font-bold leading-relaxed">
                                Trading financial instruments involves substantial risk, including the possible loss of your entire capital.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Content Section */}
                <section className="py-20 px-4 bg-zinc-950">
                    <div className="container mx-auto max-w-4xl">
                        <div className="space-y-12">

                            {/* Section 1 */}
                            <ScrollReveal delay={0.1}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-red-500/20 hover:border-red-500/40 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-red-400 font-mono">01.</span> Market Risk
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-6 text-lg font-light">
                                        Stocks, forex, and crypto markets are:
                                    </p>
                                    <ul className="space-y-3 text-gray-300 mb-6">
                                        <li className="flex items-start gap-3">
                                            <span className="text-red-400 font-bold">⚠</span>
                                            <span>Highly volatile</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-red-400 font-bold">⚠</span>
                                            <span>Influenced by unpredictable events</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-red-400 font-bold">⚠</span>
                                            <span>Subject to sudden price swings</span>
                                        </li>
                                    </ul>
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
                                        <p className="text-red-300 font-bold text-lg text-center">
                                            No AI, algorithm, or software can eliminate risk.
                                        </p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 2 */}
                            <ScrollReveal delay={0.2}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-yellow-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-yellow-400 font-mono">02.</span> No Guarantees
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-6 text-lg font-light">We do not guarantee:</p>
                                    <div className="grid md:grid-cols-2 gap-4 mb-6">
                                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
                                            <p className="text-yellow-300 font-semibold">✗ Profits</p>
                                        </div>
                                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
                                            <p className="text-yellow-300 font-semibold">✗ Accuracy</p>
                                        </div>
                                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
                                            <p className="text-yellow-300 font-semibold">✗ Win rates</p>
                                        </div>
                                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
                                            <p className="text-yellow-300 font-semibold">✗ Consistent performance</p>
                                        </div>
                                    </div>
                                    <p className="text-white font-bold text-lg text-center">
                                        Any displayed probabilities or historical results are not promises.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 3 */}
                            <ScrollReveal delay={0.3}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-red-500/20 hover:border-red-500/40 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-red-400 font-mono">03.</span> User Accountability
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-6 text-lg font-light">You acknowledge that:</p>
                                    <ul className="space-y-4 text-gray-300 mb-6">
                                        <li className="flex items-start gap-3">
                                            <span className="text-red-400 font-bold text-xl">→</span>
                                            <span className="font-semibold text-lg">You are responsible for all trading decisions</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-red-400 font-bold text-xl">→</span>
                                            <span className="font-semibold text-lg">Losses are your sole responsibility</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-red-400 font-bold text-xl">→</span>
                                            <span className="font-semibold text-lg">The Service is only a decision-support tool</span>
                                        </li>
                                    </ul>
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
                                        <p className="text-red-300 font-bold text-lg text-center">
                                            If you cannot accept losses, do not trade.
                                        </p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 4 */}
                            <ScrollReveal delay={0.4}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">04.</span> Regulatory Disclaimer
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-6 text-lg font-light">We are not registered as:</p>
                                    <div className="space-y-3 mb-6">
                                        <div className="flex items-center gap-4 p-4 bg-zinc-900 rounded-xl border border-white/5">
                                            <span className="text-red-500 text-xl font-bold">✗</span>
                                            <span className="text-gray-300 font-medium">A SEBI investment advisor</span>
                                        </div>
                                        <div className="flex items-center gap-4 p-4 bg-zinc-900 rounded-xl border border-white/5">
                                            <span className="text-red-500 text-xl font-bold">✗</span>
                                            <span className="text-gray-300 font-medium">A SEC-registered advisor</span>
                                        </div>
                                        <div className="flex items-center gap-4 p-4 bg-zinc-900 rounded-xl border border-white/5">
                                            <span className="text-red-500 text-xl font-bold">✗</span>
                                            <span className="text-gray-300 font-medium">A broker or dealer</span>
                                        </div>
                                    </div>
                                    <p className="text-white font-bold text-lg text-center">
                                        We provide software, not regulated financial services.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 5 - Final Warning */}
                            <ScrollReveal delay={0.5}>
                                <div className="p-8 bg-gradient-to-br from-red-900/20 to-orange-900/20 rounded-3xl border border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-red-400 font-mono">05.</span> Final Warning
                                    </h2>
                                    <div className="bg-black/40 rounded-2xl p-8 border border-red-500/20">
                                        <p className="text-red-300 font-semibold mb-6 text-lg">
                                            If you are:
                                        </p>
                                        <ul className="space-y-4 text-gray-300 mb-8">
                                            <li className="flex items-start gap-4">
                                                <span className="text-red-400 text-2xl">⚠</span>
                                                <span className="text-lg">Emotionally reactive</span>
                                            </li>
                                            <li className="flex items-start gap-4">
                                                <span className="text-red-400 text-2xl">⚠</span>
                                                <span className="text-lg">Financially dependent on trading income</span>
                                            </li>
                                            <li className="flex items-start gap-4">
                                                <span className="text-red-400 text-2xl">⚠</span>
                                                <span className="text-lg">Looking for guaranteed profits</span>
                                            </li>
                                        </ul>
                                        <div className="text-center pt-6 border-t border-red-500/20">
                                            <p className="text-red-400 font-black text-2xl uppercase tracking-wider">
                                                This product is not suitable for you.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Final Notice */}
                            <ScrollReveal delay={0.6}>
                                <div className="p-8 bg-gradient-to-r from-red-900/20 to-orange-900/20 rounded-3xl border border-red-500/30">
                                    <p className="text-center text-gray-300 text-base leading-relaxed">
                                        By using our Service, you acknowledge that you have read, understood, and accept all risks outlined in this disclaimer.
                                        <span className="block mt-3 text-red-400 font-bold text-lg">
                                            You trade entirely at your own risk and responsibility.
                                        </span>
                                    </p>
                                </div>
                            </ScrollReveal>

                        </div>
                    </div>
                </section>
            </div>
        </Layout>
    );
};

export default RiskDisclaimer;
