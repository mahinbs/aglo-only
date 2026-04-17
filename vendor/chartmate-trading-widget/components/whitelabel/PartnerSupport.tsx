import React from 'react';
import { ScrollReveal } from '../ui/ScrollReveal';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Palette, TrendingUp, Code, Megaphone, Scale, Bot } from 'lucide-react';

const PartnerSupport = () => {
    const roadmapPhases = [
        {
            phase: "01: Foundation",
            action: "Purchase your license & domain mapping.",
            asset: "A Global Domain & Brand Identity"
        },
        {
            phase: "02: Architecture",
            action: "Allotment of your Branding & Marketing Professionals.",
            asset: "Your Custom-Built UI & Growth Team"
        },
        {
            phase: "03: Intelligence",
            action: "Deployment of analysis & backtest tooling plus custom algo strategies built by our engineers.",
            asset: "Full platform + integration moat"
        },
        {
            phase: "04: Profit",
            action: "Start marketing with 1-year of dedicated consultation.",
            asset: "A High-Growth Revenue Stream"
        }
    ];

    const roadmapSteps = [
        {
            title: "1. License Acquisition & Seat Reservation",
            content: "Secure your partner license and lock in your 70% revenue share. This immediately initiates the allotment of your dedicated growth and tech teams."
        },
        {
            title: "2. Domain & Infrastructure Mapping",
            content: "We map the platform to your custom domain (e.g., platform.yourbrand.com). This ensures your business lives on your own digital real estate from day one."
        },
        {
            title: "3. The Brand Identity Workshop",
            content: "Work 1-on-1 with your assigned branding professional. We don't just slap on a logo; we customize the UI colors, fonts, and assets to create a $100k+ bespoke feel. Owner's Note: You have final approval on all design assets before we go live."
        },
        {
            title: "4. Institutional Data Integration",
            content: "Our engineers activate the real-time data feeds for 150+ assets across Stocks, Crypto, and Forex. We handle all institutional data costs so you don't have to."
        },
        {
            title: "5. Algo-Trading Desk Setup",
            content: "We initialize your \"Expert-Led Automation\" module. This is where we begin building the custom strategies that your future traders will use. Owner's Note: Your customers get custom algos built by us, but they pay YOU."
        },
        {
            title: "6. Admin Command Center Training",
            content: "Access your master dashboard. Here, you'll learn to manage your users, track your 70% profit share, and monitor platform performance in real-time."
        },
        {
            title: "7. High-Conversion Landing Page Build",
            content: "Your marketing specialist deploys a fully designed, high-converting sales page (similar to this one) tailored to your specific brand and target market."
        },
        {
            title: "8. The \"Go-To-Market\" Strategy Session",
            content: "Begin your 1-year growth consultation. We map out your first 90 days of user acquisition, focusing on how to attract and retain high-value traders."
        },
        {
            title: "9. Marketing & Ad Campaign Launch",
            content: "With your marketing person, you launch your first wave of social proof and ad campaigns. We provide positioning focused on validated strategy outcomes, transparent backtesting, and done-for-you deployment."
        },
        {
            title: "10. Scale & Retention Management",
            content: "Leverage our consultation for long-term retention strategies. As your user base grows, we continue to build custom algos for your clients, keeping your churn low and your revenue high."
        }
    ];

    const departments = [
        {
            title: "Your In-House Design Studio.",
            desc: "Your platform looks like a $100k custom build because we put our best designers on your brand.",
            icon: <Palette className="w-8 h-8 text-primary" />
        },
        {
            title: "CEO Growth Playbook.",
            desc: "Access the exact user-acquisition strategies we used to scale, delivered through weekly 1-on-1 sessions.",
            icon: <TrendingUp className="w-8 h-8 text-green-400" />
        },
        {
            title: "Proprietary Engineering Desk.",
            desc: "Offer your clients custom automation without ever writing a line of code. Our engineers are now your engineers.",
            icon: <Code className="w-8 h-8 text-purple-400" />
        },
        {
            title: "Your Launch Marketing Team.",
            desc: "A dedicated marketing lead to run your first campaigns. Fast-track to profitability with proven ad and launch strategies.",
            icon: <Megaphone className="w-8 h-8 text-yellow-400" />
        },
        {
            title: "Compliance & Registration Support.",
            desc: "Optional company registration and red-tape handling so you can focus on running the business, not paperwork.",
            icon: <Scale className="w-8 h-8 text-blue-400" />
        },
        {
            title: "Expert-Led Automation.",
            desc: "Your clients tell us their strategy. Our engineers code it, add an AI validation layer, and deploy it live on their broker in 72 hours - under your brand.",
            icon: <Bot className="w-8 h-8 text-red-400" />
        }
    ];

    return (
        <section className="py-24 bg-zinc-950 relative overflow-hidden">
            <div className="container mx-auto px-4 relative z-10">
                <ScrollReveal>
                    <div className="text-center max-w-4xl mx-auto mb-20">
                        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">
                            From <span className="text-primary">Vision to CEO</span>. Your Fully-Managed <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Fintech Empire</span> Starts Here.
                        </h2>
                        <p className="text-xl text-gray-400 leading-relaxed font-light">
                            Acquire the Tech. Own the Brand. We Provide the Strategic Blueprint and Expert Algo-Support to Scale Your Revenue.
                        </p>
                    </div>
                </ScrollReveal>

                {/* Launch Roadmap Table (Desktop) & Cards (Mobile) */}
                <ScrollReveal delay={0.2}>
                    <div className="mb-20">
                        <div className="bg-black/50 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-sm">
                            <div className="p-8 border-b border-white/10">
                                <h3 className="text-2xl font-bold text-white">Launch Roadmap</h3>
                            </div>
                            
                            {/* Desktop Table View */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-white/5 text-gray-400 text-sm uppercase tracking-wider">
                                            <th className="p-6 font-medium">Phase</th>
                                            <th className="p-6 font-medium">Action</th>
                                            <th className="p-6 font-medium">Your Asset</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 text-gray-300">
                                        {roadmapPhases.map((phase, index) => (
                                            <tr key={index} className="hover:bg-white/5 transition-colors">
                                                <td className="p-6 font-mono text-primary">{phase.phase}</td>
                                                <td className="p-6">{phase.action}</td>
                                                <td className="p-6 text-white font-medium">{phase.asset}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card View */}
                            <div className="md:hidden p-6 space-y-6">
                                {roadmapPhases.map((phase, index) => (
                                    <div key={index} className="bg-white/5 rounded-xl p-6 border border-white/5">
                                        <div className="font-mono text-primary mb-2 font-bold">{phase.phase}</div>
                                        <div className="mb-4">
                                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Action</div>
                                            <div className="text-gray-300">{phase.action}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Your Asset</div>
                                            <div className="text-white font-medium">{phase.asset}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </ScrollReveal>

                {/* Detailed Roadmap Accordion */}
                <div className="mb-24">
                    <ScrollReveal delay={0.3}>
                        <div className="text-center max-w-3xl mx-auto mb-16">
                            <h3 className="text-3xl font-bold text-white mb-6">Execution Details</h3>
                            <p className="text-gray-400 text-lg">
                                A step-by-step breakdown of how we take you from zero to a fully operational fintech business in weeks, not years.
                            </p>
                        </div>
                    </ScrollReveal>

                    <ScrollReveal delay={0.4}>
                        <div className="grid md:grid-cols-3 gap-6 mb-16">
                            <div className="bg-white/5 p-6 rounded-2xl border border-white/10 flex flex-col items-center text-center hover:border-cyan-500/30 transition-colors">
                                <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
                                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                                </div>
                                <h4 className="text-white font-bold mb-2">Technical Heavy Lifting</h4>
                                <p className="text-gray-400 text-sm">We handle all the complex infrastructure and data integration.</p>
                            </div>
                            <div className="bg-white/5 p-6 rounded-2xl border border-white/10 flex flex-col items-center text-center hover:border-cyan-500/30 transition-colors">
                                <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
                                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                                </div>
                                <h4 className="text-white font-bold mb-2">Focus on Growth</h4>
                                <p className="text-gray-400 text-sm">You focus purely on building relationships and driving sales.</p>
                            </div>
                            <div className="bg-white/5 p-6 rounded-2xl border border-white/10 flex flex-col items-center text-center hover:border-cyan-500/30 transition-colors">
                                <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
                                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                                </div>
                                <h4 className="text-white font-bold mb-2">Proven Infrastructure</h4>
                                <p className="text-gray-400 text-sm">Launch with confidence on a platform used by thousands.</p>
                            </div>
                        </div>
                    </ScrollReveal>

                    <ScrollReveal delay={0.5}>
                        <div className="max-w-4xl mx-auto">
                            <Accordion type="single" collapsible className="w-full space-y-4">
                                {roadmapSteps.map((step, index) => (
                                    <AccordionItem key={index} value={`item-${index}`} className="border border-white/10 rounded-xl px-4 bg-black/30 data-[state=open]:bg-white/5 data-[state=open]:border-cyan-500/30 transition-all">
                                        <AccordionTrigger className="text-left hover:no-underline hover:text-primary text-white font-medium py-4">
                                            {step.title}
                                        </AccordionTrigger>
                                        <AccordionContent className="text-gray-400 leading-relaxed pb-4">
                                            {step.content}
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </div>
                    </ScrollReveal>
                </div>

                {/* Department Cards */}
                <ScrollReveal delay={0.5}>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {departments.map((dept, index) => (
                            <div key={index} className="p-8 bg-zinc-900/50 border border-white/5 rounded-3xl hover:border-cyan-500/30 hover:bg-zinc-900 transition-all duration-300 group">
                                <div className="mb-6 p-3 bg-black rounded-2xl w-fit border border-white/10 group-hover:border-cyan-500/30 transition-colors">
                                    {dept.icon}
                                </div>
                                <h3 className="text-xl font-bold text-white mb-3 group-hover:text-primary transition-colors">
                                    {dept.title}
                                </h3>
                                <p className="text-gray-400 text-sm leading-relaxed">
                                    {dept.desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </ScrollReveal>
            </div>
        </section>
    );
};

export default PartnerSupport;
