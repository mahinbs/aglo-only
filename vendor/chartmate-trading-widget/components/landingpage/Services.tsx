import React from 'react';
import { FaPalette, FaUsers, FaTags, FaRocket } from 'react-icons/fa';
import { ScrollReveal } from '../ui/ScrollReveal';

const features = [
    {
        icon: <FaPalette className="w-8 h-8 text-primary" />,
        title: "Custom Branding",
        description: "Upload your logo, choose your brand colors, and set your own font.",
        bg: "bg-cyan-500/10",
        border: "border-cyan-500/30"
    },
    {
        icon: <FaUsers className="w-8 h-8 text-blue-400" />,
        title: "User Management",
        description: "Track your subscribers, manage access levels, and view churn rates.",
        bg: "bg-primary/10",
        border: "border-primary/30"
    },
    {
        icon: <FaTags className="w-8 h-8 text-purple-400" />,
        title: "Custom Pricing",
        description: "You decide what to charge—monthly, yearly, or lifetime access.",
        bg: "bg-secondary/10",
        border: "border-secondary/30"
    },
    {
        icon: <FaRocket className="w-8 h-8 text-pink-400" />,
        title: "Automated Onboarding",
        description: "Seamless user registration and login dashboards for your clients.",
        bg: "bg-pink-500/10",
        border: "border-pink-500/30"
    }
];

const Services = () => {
    return (
        <section id="features" className="py-24 bg-black relative">
            <div className="container mx-auto px-4 relative z-10">
                <ScrollReveal>
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white tracking-tight">
                            Business <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary">Management</span>
                        </h2>
                        <p className="text-gray-400 max-w-2xl mx-auto text-xl font-light">
                            Fully control your trading platform.
                        </p>
                        <div className="mt-6">
                            <span className="text-green-400 font-bold inline-block bg-green-500/10 px-6 py-3 rounded-full border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.15)] text-lg">
                                Earn 70% Profit on Every Subscription Sold.
                            </span>
                        </div>
                    </div>
                </ScrollReveal>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {features.map((feature, index) => (
                        <ScrollReveal key={index} delay={index * 0.15} direction="up">
                            <div className={`bg-zinc-900/50 p-8 rounded-2xl shadow-sm hover:shadow-cyan-500/10 transition-all hover:-translate-y-2 border ${feature.border} h-full group`}>
                                <div className={`mb-6 ${feature.bg} w-16 h-16 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                                    {feature.icon}
                                </div>
                                <h3 className="text-xl font-bold mb-3 text-white">{feature.title}</h3>
                                <p className="text-gray-400 leading-relaxed font-light">
                                    {feature.description}
                                </p>
                            </div>
                        </ScrollReveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Services;
