import React, { useState } from 'react';
import './Pricing.css';

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
);

const CrossIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);

const Pricing = () => {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <section className="pricing-section section-wrap" id="pricing">
      {/* Brutalist Section Divider */}
      <div className="section-divider-marquee">
        <div className="divider-track">
          <span>100% LOCAL PRIVACY</span><span className="divider-dot"></span>
          <span>ZERO HALLUCINATION</span><span className="divider-dot"></span>
          <span>INFINITE CONTEXT</span><span className="divider-dot"></span>
          <span>FAISS VECTOR STORE</span><span className="divider-dot"></span>
          <span>HUGGINGFACE NATIVE</span><span className="divider-dot"></span>
          <span>100% LOCAL PRIVACY</span><span className="divider-dot"></span>
          <span>ZERO HALLUCINATION</span><span className="divider-dot"></span>
          <span>INFINITE CONTEXT</span><span className="divider-dot"></span>
          <span>FAISS VECTOR STORE</span><span className="divider-dot"></span>
          <span>HUGGINGFACE NATIVE</span><span className="divider-dot"></span>
        </div>
      </div>

      {/* Crazy Background Elements */}
      <div className="pricing-bg-elements">
        <div className="pricing-marquee-container">
          <div className="marquee-band band-1">
            <span className="marquee-text">LOCAL FAISS STORE /// NEURAL VECTORIZATION /// ZERO HALLUCINATION /// UNLIMITED PDFS /// </span>
            <span className="marquee-text">LOCAL FAISS STORE /// NEURAL VECTORIZATION /// ZERO HALLUCINATION /// UNLIMITED PDFS /// </span>
          </div>
          <div className="marquee-band band-2">
            <span className="marquee-text">ENTERPRISE CLOUD /// 99.99% UPTIME /// DEDICATED HOSTING /// CROSS-DEVICE SYNC /// </span>
            <span className="marquee-text">ENTERPRISE CLOUD /// 99.99% UPTIME /// DEDICATED HOSTING /// CROSS-DEVICE SYNC /// </span>
          </div>
        </div>
        <div className="pricing-ambient-glow"></div>
      </div>

      <div className="pricing-header">
        <span className="tag-accent">Simple Scaling</span>
        <h2 className="display-lg">Pricing for <span className="lime-text">Everyone</span>.</h2>
        <p className="pricing-subtitle">
          Whether you are running local models or scaling an enterprise API, we have a tier for you.
        </p>
      </div>

      <div className="billing-toggle-container">
        <span className={`toggle-label ${!isYearly ? 'active' : ''}`}>Monthly</span>
        <div className="toggle-switch" onClick={() => setIsYearly(!isYearly)}>
          <div className={`toggle-knob ${isYearly ? 'yearly' : ''}`}></div>
        </div>
        <span className={`toggle-label ${isYearly ? 'active' : ''}`}>
          Yearly <span className="save-badge">Save 20%</span>
        </span>
      </div>

      <div className="pricing-cards-container">
        {/* Tier 1 - Local */}
        <div className="pricing-card tier-local">
          <div className="card-top">
            <h3 className="tier-name">Local / Hobby</h3>
            <div className="tier-price">
              <span className="currency">$</span>0<span className="period">/mo</span>
            </div>
            <p className="tier-desc">Run everything on your own hardware. 100% private and unrestricted.</p>
          </div>
          <div className="card-features">
            <ul>
              <li><CheckIcon /> Local Hugging Face Models</li>
              <li><CheckIcon /> Unlimited PDF Processing</li>
              <li><CheckIcon /> Local FAISS Vector Store</li>
              <li className="disabled"><CrossIcon /> Cloud Knowledge Sync</li>
              <li className="disabled"><CrossIcon /> High-throughput API Access</li>
            </ul>
          </div>
          <button className="pricing-btn btn-secondary">Clone Repository</button>
        </div>

        {/* Tier 2 - Pro Cloud */}
        <div className="pricing-card tier-pro">
          <div className="pro-badge">MOST POPULAR</div>
          <div className="card-top">
            <h3 className="tier-name">Pro Cloud</h3>
            <div className="tier-price">
              <span className="currency">$</span>{isYearly ? '24' : '29'}<span className="period">/mo</span>
            </div>
            <p className="tier-desc">Hosted API and synchronized knowledge bases for power users and small teams.</p>
          </div>
          <div className="card-features">
            <ul>
              <li><CheckIcon /> Everything in Local, plus:</li>
              <li><CheckIcon /> 50GB Cloud Vector Storage</li>
              <li><CheckIcon /> GPT-4 / Claude 3 Integration</li>
              <li><CheckIcon /> Cross-device Cloud Sync</li>
              <li><CheckIcon /> Priority Email Support</li>
            </ul>
          </div>
          <button className="pricing-btn btn-primary pulse-hover">Start Free Trial</button>
        </div>

        {/* Tier 3 - Enterprise */}
        <div className="pricing-card tier-enterprise">
          <div className="card-top">
            <h3 className="tier-name">Enterprise</h3>
            <div className="tier-price">
              <span className="custom-price">Custom</span>
            </div>
            <p className="tier-desc">Dedicated infrastructure and advanced access controls for large organizations.</p>
          </div>
          <div className="card-features">
            <ul>
              <li><CheckIcon /> Unlimited Cloud Storage</li>
              <li><CheckIcon /> Custom Fine-tuned Models</li>
              <li><CheckIcon /> Dedicated Account Manager</li>
              <li><CheckIcon /> SSO & Advanced Security</li>
              <li><CheckIcon /> 99.99% Uptime SLA</li>
            </ul>
          </div>
          <button className="pricing-btn btn-secondary">Contact Sales</button>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
