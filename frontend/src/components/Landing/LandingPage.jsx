import React from 'react';
import LandingNavbar from './LandingNavbar';
import Hero from './Hero';
import CustomCursor from './CustomCursor';
import './LandingGlobal.css'; // Isolated global styles for the new UI

const LandingPage = () => {
  return (
    <div className="landing-page-root">
      <CustomCursor />
      <LandingNavbar />
      <Hero />
    </div>
  );
};

export default LandingPage;
