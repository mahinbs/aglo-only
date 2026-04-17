import Layout from '../components/landingpage/Layout'
import Hero from '../components/landingpage/Hero'
import Services from '../components/landingpage/Services'
import WhyUs from '../components/landingpage/WhyUs'
import Testimonial from '../components/landingpage/Testimonial'
import WorkSlider from '../components/landingpage/WorkSlider'
import Pricing from '../components/landingpage/Pricing'
import HowToGetStarted from '../components/landingpage/HowToGetStarted'
import LatestInsights from '../components/landingpage/LatestInsights'
import FAQ from '../components/landingpage/FAQ'
import HowItWorks from '../components/landingpage/HowItWorks'
import DemoFeature from '../components/landingpage/DemoFeature'
import SupportedMarkets from '../components/landingpage/SupportedMarkets'

const LandingPage = () => {
    return (
        <Layout>
            <div className="bg-black text-white font-sans selection:bg-cyan-500 selection:text-black min-h-screen">
                <Hero />
                <SupportedMarkets />
                <HowItWorks />
                <DemoFeature />
                <HowToGetStarted />
                <WorkSlider />
                <Pricing />
                <LatestInsights />
                <FAQ />
                <Testimonial />
            </div>
        </Layout>
    )
}

export default LandingPage