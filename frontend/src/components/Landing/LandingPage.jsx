import React from 'react';
import LandingNavbar from './LandingNavbar';
import Hero from './Hero';
import Features from './Features';
import HowItWorks from './HowItWorks';
import Pricing from './Pricing';
import CustomCursor from './CustomCursor';
import './LandingGlobal.css'; // Isolated global styles for the new UI

const LandingPage = () => {
  return (
    <div className="landing-page-root">
      <CustomCursor />
      <LandingNavbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
    </div>
  );
};

export default LandingPage;
