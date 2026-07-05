import BackToTop from "../BackToTop";
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LandingNavbar from './LandingNavbar';
import Hero from './Hero';
import Features from './Features';
import HowItWorks from './HowItWorks';
import Pricing from './Pricing';
import FAQ from './FAQ';
import Footer from './Footer';
import CustomCursor from './CustomCursor';
import './LandingGlobal.css'; // Isolated global styles for the new UI

const LandingPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  if (user) return null;

  return (
    <div className="landing-page-root">
      <CustomCursor />
      <LandingNavbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <FAQ />
      <Footer />
      <BackToTop />
    </div>
  );
};

export default LandingPage;
