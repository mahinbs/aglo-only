import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaShieldAlt } from 'react-icons/fa';
import Layout from '../components/landingpage/Layout';
import { ScrollReveal } from '../components/ui/ScrollReveal';

const PrivacyPolicy = () => {
    return (
        <Layout>
            <div className="min-h-screen bg-black text-white font-sans selection:bg-cyan-500 selection:text-black">
                <Helmet>
                    <title>Privacy Policy | Boostmysites</title>
                    <meta name="description" content="Privacy Policy for Boostmysites platform. Learn how we collect, use, and protect your data." />
                </Helmet>

                {/* Hero Section */}
                <section className="relative pt-40 pb-20 px-4 overflow-hidden border-b border-white/5">
                    <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/50 to-black pointer-events-none"></div>
                    <div className="container mx-auto relative z-10">
                        <ScrollReveal>
                            <Link
                                to="/"
                                className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 mb-8 transition-colors"
                            >
                                <FaArrowLeft /> Back to Home
                            </Link>
                            <div className="flex items-center gap-6 mb-6">
                                <div className="p-5 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 backdrop-blur-sm">
                                    <FaShieldAlt className="text-4xl text-cyan-400" />
                                </div>
                                <div>
                                    <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white mb-2">Privacy Policy</h1>
                                    <p className="text-gray-400 font-medium">Last Updated: 20-01-2025</p>
                                </div>
                            </div>
                        </ScrollReveal>
                    </div>
                </section>

                {/* Content Section */}
                <section className="py-20 px-4 bg-zinc-950">
                    <div className="container mx-auto max-w-4xl">
                        <div className="space-y-12">

                            {/* Section 1 */}
                            <ScrollReveal delay={0.1}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">01.</span> Information We Collect
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-6 text-lg font-light">We may collect:</p>
                                    <ul className="space-y-3 text-gray-300 mb-6">
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">•</span>
                                            <span>Name, email, and account details</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">•</span>
                                            <span>Device, browser, IP address</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">•</span>
                                            <span>Usage behavior inside the software</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">•</span>
                                            <span>Payment metadata (processed by third-party providers)</span>
                                        </li>
                                    </ul>
                                    <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6">
                                        <p className="text-green-400 font-semibold text-center">
                                            We do not collect brokerage credentials or trading account passwords.
                                        </p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 2 */}
                            <ScrollReveal delay={0.2}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">02.</span> How We Use Data
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-6 text-lg font-light">Your data is used to:</p>
                                    <ul className="space-y-3 text-gray-300 mb-6">
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">✓</span>
                                            <span>Provide and improve the Service</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">✓</span>
                                            <span>Maintain security and prevent abuse</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">✓</span>
                                            <span>Analyze usage patterns</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">✓</span>
                                            <span>Communicate updates and service notices</span>
                                        </li>
                                    </ul>
                                    <p className="text-white font-bold text-lg border-t border-white/10 pt-4">
                                        We do not sell your personal data.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 3 */}
                            <ScrollReveal delay={0.3}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">03.</span> Cookies & Tracking
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-6 text-lg font-light">
                                        We use cookies and analytics tools to:
                                    </p>
                                    <ul className="space-y-3 text-gray-300 mb-6 pl-4 border-l border-white/10">
                                        <li>• Improve performance</li>
                                        <li>• Track usage trends</li>
                                        <li>• Optimize the user experience</li>
                                    </ul>
                                    <p className="text-gray-400 italic text-sm">
                                        You can disable cookies, but functionality may degrade.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 4 */}
                            <ScrollReveal delay={0.4}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">04.</span> Data Sharing
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-6 text-lg font-light">
                                        We may share limited data with:
                                    </p>
                                    <ul className="space-y-3 text-gray-300 mb-6">
                                        <li className="flex items-start gap-3">
                                            <span className="text-yellow-400 font-bold">→</span>
                                            <span>Payment processors</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-yellow-400 font-bold">→</span>
                                            <span>Analytics providers</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-yellow-400 font-bold">→</span>
                                            <span>Legal authorities (if required by law)</span>
                                        </li>
                                    </ul>
                                    <p className="text-white font-bold text-lg">
                                        We do not share data with brokers, funds, or signal groups.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 5 */}
                            <ScrollReveal delay={0.5}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">05.</span> Data Security
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-6 text-lg font-light">
                                        We use industry-standard safeguards.
                                    </p>
                                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-6">
                                        <p className="text-yellow-400 font-semibold text-center">
                                            However, no system is 100% secure. Use at your own risk.
                                        </p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 6 */}
                            <ScrollReveal delay={0.6}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">06.</span> User Rights
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed mb-6 text-lg font-light">You may request:</p>
                                    <ul className="space-y-3 text-gray-300 mb-6">
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">✓</span>
                                            <span>Access to your data</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">✓</span>
                                            <span>Correction or deletion</span>
                                        </li>
                                        <li className="flex items-start gap-3">
                                            <span className="text-cyan-400 font-bold">✓</span>
                                            <span>Account closure</span>
                                        </li>
                                    </ul>
                                    <p className="text-gray-400 italic text-sm">
                                        Some data may be retained for legal or compliance reasons.
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Section 7 */}
                            <ScrollReveal delay={0.7}>
                                <div className="p-8 bg-black/50 rounded-3xl border border-cyan-500/20 hover:border-cyan-500/40 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                                        <span className="text-cyan-400 font-mono">07.</span> Policy Updates
                                    </h2>
                                    <p className="text-gray-300 leading-relaxed text-lg font-light">
                                        We may update this policy at any time. <span className="text-cyan-400 font-semibold">Continued use = acceptance.</span>
                                    </p>
                                </div>
                            </ScrollReveal>

                            {/* Final Notice */}
                            <ScrollReveal delay={0.8}>
                                <div className="p-8 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 rounded-3xl border border-cyan-500/30">
                                    <p className="text-center text-gray-300 text-base leading-relaxed">
                                        By using our Service, you acknowledge that you have read and understood this Privacy Policy.
                                        If you have any questions about how we handle your data, please contact us.
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

export default PrivacyPolicy;
