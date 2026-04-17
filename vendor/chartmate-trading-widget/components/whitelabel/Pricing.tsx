import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { ScrollReveal } from '../ui/ScrollReveal';
import { createCheckoutSession } from '@/services/stripeService';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useMyTenantMembership } from '@/hooks/useWhitelabel';

const WL_PLANS = [
    { id: "wl_1_year", name: "1 Year License", price: "$1,999", originalPrice: "$2,499", duration: "/ 1 year", badge: "Standard", badgeColor: "bg-gray-700", isRecommended: false, planId: "wl_1_year" },
    { id: "wl_2_years", name: "2 Year License", price: "$2,499", originalPrice: "$2,999", duration: "/ 2 years", badge: "Popular", badgeColor: "bg-secondary", isRecommended: true, planId: "wl_2_years" },
    { id: "wl_5_years", name: "5 Year License", price: "$3,399", originalPrice: "$4,999", duration: "/ 5 years", badge: "Best Value", badgeColor: "bg-cyan-500 text-black", isRecommended: false, planId: "wl_5_years", contactOnly: true },
];

const Pricing = () => {
    const navigate = useNavigate();
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
    const { user } = useAuth();
    const { membership } = useMyTenantMembership(user?.id);

    const resolveBranding = () => {
        const wlTenant = membership?.role === "admin" && membership?.status === "active"
            ? membership.tenant
            : null;
        const brandName = wlTenant?.brand_name?.trim() || "My Brand";
        const slug = wlTenant?.slug?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") || "my-brand";
        return { brandName, slug };
    };

    const handleGetPlan = async (plan: typeof WL_PLANS[0]) => {
        if (plan.contactOnly) {
            document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
            return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            toast.error("Please sign in to purchase");
            navigate("/auth?redirect=" + encodeURIComponent("/white-label#pricing"));
            return;
        }
        const { brandName, slug } = resolveBranding();
        setLoadingPlan(plan.planId);
        const result = await createCheckoutSession({
            plan_id: plan.planId,
            type: "whitelabel",
            success_url: window.location.origin + "/?checkout=success&type=wl",
            cancel_url: window.location.origin + "/white-label#pricing",
            wl: { brand_name: brandName, slug },
        });
        setLoadingPlan(null);
        if (result.error) {
            toast.error(result.error);
            return;
        }
        if (result.url) window.location.href = result.url;
    };

    return (
        <section id="pricing" className="py-16 bg-black relative">
            <div className="container mx-auto px-4 relative z-10">
                <ScrollReveal>
                    <div className="text-center max-w-3xl mx-auto mb-16">
                        <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight">
                            Simple, Transparent <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Pricing</span>
                        </h2>
                        <p className="text-xl text-gray-400 font-light">
                            Your revenue. Your brand. Choose the plan that fits your business model and start selling under your name.
                        </p>
                    </div>
                </ScrollReveal>

                <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto items-center">
                    {WL_PLANS.map((plan, index) => (
                        <ScrollReveal key={index} delay={index * 0.2} direction="up">
                            <div className={`rounded-3xl p-8 lg:p-10 flex flex-col h-full relative overflow-hidden group transition-all duration-300 ${plan.isRecommended ? 'bg-gradient-to-b from-gray-900 via-zinc-900 to-black border border-cyan-500 shadow-[0_0_40px_rgba(6,182,212,0.2)] md:scale-105 z-20' : 'bg-zinc-900/50 border border-white/10 hover:border-white/30 z-10'}`}>

                                {plan.isRecommended && (
                                    <div className="absolute top-0 right-0 p-4 opacity-10 scale-150 transform group-hover:scale-110 transition-transform duration-700 pointer-events-none">
                                        <svg className="w-64 h-64 text-cyan-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" /></svg>
                                    </div>
                                )}

                                <div className="mb-8 relative z-10 text-center">
                                    <div className={`inline-block ${plan.badgeColor} text-xs font-bold px-4 py-1.5 rounded-full mb-6 uppercase tracking-widest`}>
                                        {plan.badge}
                                    </div>
                                    <h3 className={`text-2xl font-bold mb-2 ${plan.isRecommended ? 'text-primary' : 'text-white'}`}>{plan.name}</h3>
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="text-gray-500 line-through text-lg">{plan.originalPrice}</span>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-5xl font-black text-white">{plan.price}</span>
                                            <span className="text-gray-400 font-medium text-sm">{plan.duration}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6 mb-8 flex-grow relative z-10">
                                    <div className="space-y-3">
                                        <h4 className="text-white font-bold text-xs uppercase tracking-wider border-b border-white/10 pb-2">Includes</h4>
                                        <ul className="space-y-3">
                                            {[
                                                "Your own branded trading software",
                                                "Deployment on your own domain",
                                                "Fully designed landing page",
                                                "Client login dashboard",
                                                "Admin panel to manage users",
                                                "Revenue model built around monthly subscriptions",
                                                "AI-powered strategy validation and analysis",
                                                "Risk–reward calculator",
                                                "Strategy builder panel",
                                                "Trade performance tracking",
                                                "Basic backtesting module",
                                                "Done-for-you live strategy deployment by our engineering desk"
                                            ].map((item, i) => (
                                                <li key={i} className="flex items-start gap-3">
                                                    <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${plan.isRecommended ? 'text-cyan-500' : 'text-gray-400'}`} />
                                                    <span className="text-gray-300 text-sm">{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    {/* Revenue Model */}
                                    <div className="bg-black/50 rounded-xl p-4 border border-white/5">
                                        <h4 className={`${plan.isRecommended ? 'text-primary' : 'text-gray-400'} font-bold text-xs uppercase tracking-wider mb-3`}>Revenue Model</h4>
                                        <ul className="space-y-2">
                                            <li className="flex justify-between text-sm">
                                                <span className="text-gray-400">Client Billing</span>
                                                <span className="text-white font-medium">Monthly subscriptions</span>
                                            </li>
                                            <li className="flex justify-between text-sm">
                                                <span className="text-gray-400">Plans You Sell</span>
                                                <span className="text-white font-medium">Starter / Growth / Pro</span>
                                            </li>
                                            <li className="flex justify-between text-sm">
                                                <span className="text-gray-400">Your Share</span>
                                                <span className="text-green-400 font-bold">70%</span>
                                            </li>
                                            <li className="flex justify-between text-sm">
                                                <span className="text-gray-400">Platform Share</span>
                                                <span className="text-gray-500 font-medium">30%</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleGetPlan(plan)}
                                    disabled={!!loadingPlan}
                                    className={`w-full block text-center ${plan.isRecommended ? 'bg-cyan-500 hover:bg-primary text-black shadow-[0_0_20px_rgba(6,182,212,0.3)]' : 'bg-white/10 hover:bg-white/20 text-white'} font-bold py-4 rounded-xl transition-all relative z-10 text-lg disabled:opacity-70`}
                                >
                                    {loadingPlan === plan.planId ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : (plan.contactOnly ? "Contact Us" : `Get ${plan.name}`)}
                                </button>
                            </div>
                        </ScrollReveal>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Pricing;
