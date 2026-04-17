import React from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Layout from '../components/landingpage/Layout';
import WhiteLabelHero from '../components/whitelabel/Hero';
import PartnerSupport from '../components/whitelabel/PartnerSupport';
import InsideTheSoftware from '../components/whitelabel/InsideTheSoftware';
// import SupportedMarkets from '../components/landingpage/SupportedMarkets';
import WhiteLabelWhyUs from '../components/whitelabel/WhyUs';
// import WhiteLabelWorkSlider from '../components/whitelabel/WorkSlider';
import WhiteLabelPricing from '../components/whitelabel/Pricing';
import WhiteLabelHowToGetStarted from '../components/whitelabel/HowToGetStarted';

const WhiteLabelPage = () => {
    const location = useLocation();

    React.useEffect(() => {
        if (!location.hash) return;
        const id = location.hash.replace("#", "");
        const node = document.getElementById(id);
        if (node) {
            setTimeout(() => {
                node.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 60);
        }
    }, [location.hash]);

    return (
        <Layout>
            <Helmet>
                <title>White-label trading platform | TradingSmart.ai</title>
                <meta
                    name="description"
                    content="Resell a full trading stack under your brand: analysis, backtests, strategies, options, paper and live execution—plus engineering-led custom algo integration for your clients."
                />
            </Helmet>
            <div className="bg-black text-white font-sans selection:bg-cyan-500 selection:text-black min-h-screen">
                <WhiteLabelHero />
                <PartnerSupport />
                <InsideTheSoftware />
                {/* <SupportedMarkets /> */}
                <WhiteLabelWhyUs />
                {/* <WhiteLabelWorkSlider /> */}
                <WhiteLabelPricing />
                <WhiteLabelHowToGetStarted />
            </div>
        </Layout>
    );
};

export default WhiteLabelPage;
