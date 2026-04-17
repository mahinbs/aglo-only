import React from "react";
// import Navbar from "./Navbar";
// import Footer from "./Footer";
import AiPredictionHeader from "./mainlandingpage/AiPredictionHeader";
import AiPredictionFooter from "./mainlandingpage/AiPredictionFooter";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex flex-col min-h-screen">
      <AiPredictionHeader />
      <main className="flex-grow">{children}</main>
      <AiPredictionFooter />
    </div>
  );
};

export default Layout;
