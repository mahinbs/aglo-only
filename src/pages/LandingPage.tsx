import landingHtml from "./LandingPage.html?raw";

export default function LandingPage() {
  return (
    <iframe
      title="TradingSmart Landing Page"
      srcDoc={landingHtml}
      style={{
        border: "none",
        width: "100%",
        height: "100dvh",
        minHeight: "100vh",
        display: "block",
        background: "#060912",
      }}
    />
  );
}
