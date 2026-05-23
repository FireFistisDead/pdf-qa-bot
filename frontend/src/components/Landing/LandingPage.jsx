import React from 'react';
import LandingNavbar from './LandingNavbar';
import Hero from './Hero';
import Features from './Features';
import CustomCursor from './CustomCursor';
import './LandingGlobal.css'; // Isolated global styles for the new UI

const LandingPage = () => {
  return (
    <div className="landing-page-root">
      <CustomCursor />
      <LandingNavbar />
      <Hero />
      <Features />
    </div>
  );
};

export default LandingPage;
