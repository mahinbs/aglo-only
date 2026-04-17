import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaShieldAlt } from 'react-icons/fa';
import Layout from '../components/landingpage/Layout';
import { ScrollReveal } from '../components/ui/ScrollReveal';

const TermsOfService = () => {
    return (
        <Layout>
            <div className="min-h-screen bg-black text-white font-sans selection:bg-cyan-500 selection:text-black">
                <Helmet>
                    <title>Terms & Conditions | Platform</title>
                    <meta name="description" content="Terms & Conditions for our platform." />
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
                                <div>
                                    <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white mb-2">Terms & Conditions</h1>
                                    <p className="text-gray-400 font-medium">Please read these terms carefully before using the platform.</p>
                                </div>
                            </div>
                        </ScrollReveal>
                    </div>
                </section>

                {/* Content Section */}
                <section className="pb-20 px-4 bg-zinc-950">
                    <div className="container mx-auto max-w-6xl">
                        <div className="space-y-12">

                            {/* Section 1 */}
                            <ScrollReveal delay={0.1}>
                                <div className="p-4 md:p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6">
                                        <span className="text-cyan-400">1.</span> Nature of Service
                                    </h2>
                                    <div className="text-gray-300 leading-relaxed space-y-4 font-light">
                                        <p>This platform is a technology service provider that offers software tools, APIs, and infrastructure to enable users to integrate and automate their own trading systems.</p>
                                        <p>We do not provide any trading strategies, investment advice, recommendations, research analysis, or portfolio management services.</p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 2 */}
                            <ScrollReveal delay={0.15}>
                                <div className="p-4 md:p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6">
                                        <span className="text-cyan-400">2.</span> No Investment Advisory
                                    </h2>
                                    <div className="text-gray-300 leading-relaxed space-y-4 font-light">
                                        <p>We are not registered as an Investment Adviser or Research Analyst under the Securities and Exchange Board of India regulations.</p>
                                        <p>Nothing on this platform should be construed as financial advice, trading advice, or a recommendation to buy or sell any securities.</p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 3 */}
                            <ScrollReveal delay={0.2}>
                                <div className="p-4 md:p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6">
                                        <span className="text-cyan-400">3.</span> User Responsibility
                                    </h2>
                                    <div className="text-gray-300 leading-relaxed space-y-4 font-light">
                                        <p>All trading decisions, strategies, and executions are solely determined by the user.</p>
                                        <p>Users are fully responsible for:</p>
                                        <ul className="list-disc pl-6 space-y-2">
                                            <li>Their trading strategies</li>
                                            <li>Risk management</li>
                                            <li>Financial outcomes (profits or losses)</li>
                                        </ul>
                                        <p>The platform has no control over user decisions or market outcomes.</p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 4 */}
                            <ScrollReveal delay={0.25}>
                                <div className="p-4 md:p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6">
                                        <span className="text-cyan-400">4.</span> No Trade Execution Control
                                    </h2>
                                    <div className="text-gray-300 leading-relaxed space-y-4 font-light">
                                        <p>We do not:</p>
                                        <ul className="list-disc pl-6 space-y-2">
                                            <li>Execute trades on behalf of users</li>
                                            <li>Manage user brokerage accounts</li>
                                            <li>Access funds or holdings</li>
                                        </ul>
                                        <p>Any integration with brokers or third-party platforms is initiated and controlled entirely by the user.</p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 5 */}
                            <ScrollReveal delay={0.3}>
                                <div className="p-4 md:p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6">
                                        <span className="text-cyan-400">5.</span> Third-Party Integrations
                                    </h2>
                                    <div className="text-gray-300 leading-relaxed space-y-4 font-light">
                                        <p>Our platform may integrate with third-party services such as brokers, APIs, or trading platforms.</p>
                                        <p>We are not responsible for:</p>
                                        <ul className="list-disc pl-6 space-y-2">
                                            <li>Downtime or failures of third-party services</li>
                                            <li>Data inaccuracies from external providers</li>
                                            <li>Any losses arising from such integrations</li>
                                        </ul>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 6 */}
                            <ScrollReveal delay={0.35}>
                                <div className="p-4 md:p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6">
                                        <span className="text-cyan-400">6.</span> No Guarantee of Returns
                                    </h2>
                                    <div className="text-gray-300 leading-relaxed space-y-4 font-light">
                                        <p>We do not guarantee:</p>
                                        <ul className="list-disc pl-6 space-y-2">
                                            <li>Profits</li>
                                            <li>Returns</li>
                                            <li>Performance outcomes</li>
                                        </ul>
                                        <p>All trading involves risk, including potential loss of capital.</p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 7 */}
                            <ScrollReveal delay={0.4}>
                                <div className="p-4 md:p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6">
                                        <span className="text-cyan-400">7.</span> Limitation of Liability
                                    </h2>
                                    <div className="text-gray-300 leading-relaxed space-y-4 font-light">
                                        <p>Under no circumstances shall the platform, its founders, employees, or affiliates be liable for:</p>
                                        <ul className="list-disc pl-6 space-y-2">
                                            <li>Any financial losses</li>
                                            <li>Trading losses</li>
                                            <li>Indirect or consequential damages</li>
                                        </ul>
                                        <p>Use of the platform is entirely at the user’s own risk.</p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 8 */}
                            <ScrollReveal delay={0.45}>
                                <div className="p-4 md:p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6">
                                        <span className="text-cyan-400">8.</span> Acceptable Use
                                    </h2>
                                    <div className="text-gray-300 leading-relaxed space-y-4 font-light">
                                        <p>Users agree NOT to:</p>
                                        <ul className="list-disc pl-6 space-y-2">
                                            <li>Use the platform for illegal or unauthorized activities</li>
                                            <li>Misuse APIs or attempt to exploit the system</li>
                                            <li>Violate any financial regulations applicable in their jurisdiction</li>
                                        </ul>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 9 */}
                            <ScrollReveal delay={0.5}>
                                <div className="p-4 md:p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6">
                                        <span className="text-cyan-400">9.</span> Suspension / Termination
                                    </h2>
                                    <div className="text-gray-300 leading-relaxed space-y-4 font-light">
                                        <p>We reserve the right to:</p>
                                        <ul className="list-disc pl-6 space-y-2">
                                            <li>Suspend or terminate accounts</li>
                                            <li>Restrict access</li>
                                        </ul>
                                        <p>If misuse, suspicious activity, or regulatory risks are identified.</p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 10 */}
                            <ScrollReveal delay={0.55}>
                                <div className="p-4 md:p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6">
                                        <span className="text-cyan-400">10.</span> Intellectual Property
                                    </h2>
                                    <div className="text-gray-300 leading-relaxed space-y-4 font-light">
                                        <p>All software, branding, UI/UX, and infrastructure belong to the company.</p>
                                        <p>Users are not allowed to:</p>
                                        <ul className="list-disc pl-6 space-y-2">
                                            <li>Copy</li>
                                            <li>Resell</li>
                                            <li>Reverse engineer</li>
                                        </ul>
                                        <p>Any part of the platform without permission.</p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 11 */}
                            <ScrollReveal delay={0.6}>
                                <div className="p-4 md:p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6">
                                        <span className="text-cyan-400">11.</span> Modifications
                                    </h2>
                                    <div className="text-gray-300 leading-relaxed space-y-4 font-light">
                                        <p>We may update these Terms at any time. Continued use of the platform implies acceptance of updated terms.</p>
                                    </div>
                                </div>
                            </ScrollReveal>

                            {/* Section 12 */}
                            <ScrollReveal delay={0.65}>
                                <div className="p-4 md:p-8 bg-black/50 rounded-3xl border border-white/5 hover:border-cyan-500/20 transition-colors">
                                    <h2 className="text-2xl font-bold text-white mb-6">
                                        <span className="text-cyan-400">12.</span> Governing Law
                                    </h2>
                                    <div className="text-gray-300 leading-relaxed space-y-4 font-light">
                                        <p>These Terms shall be governed by the laws of India.</p>
                                        <p>Any disputes shall be subject to the jurisdiction of the appropriate courts.</p>
                                    </div>
                                </div>
                            </ScrollReveal>

                        </div>
                    </div>
                </section>
            </div>
        </Layout>
    );
};

export default TermsOfService;
