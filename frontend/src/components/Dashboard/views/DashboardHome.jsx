import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useDashboardData } from '../../../hooks/useDashboardData';
import './DashboardHome.css';

/* ── Animated counter hook ── */
const useCounter = (target, ms = 1400) => {
  const [v, setV] = useState(0);
  const r = useRef(null);
  useEffect(() => {
    if (target === undefined || target === null) return;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / ms, 1);
      setV(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) r.current = requestAnimationFrame(tick);
    };
    r.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(r.current);
  }, [target, ms]);
  return v;
};

/* ── SKELETON LOADERS ── */
const SkeletonDataBar = () => (
  <section className="dash-databar">
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="databar-col">
        <div className="skeleton-box skel-val"></div>
        <div className="skeleton-box skel-lbl"></div>
      </div>
    ))}
  </section>
);

const SkeletonList = ({ count = 4 }) => (
  <div className="skel-list">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="skel-list-item">
        <div className="skeleton-box skel-icon"></div>
        <div className="skel-txt-group">
          <div className="skeleton-box skel-txt-1"></div>
          <div className="skeleton-box skel-txt-2"></div>
        </div>
      </div>
    ))}
  </div>
);

const DashboardHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { stats, activity, insights, isLoading, error } = useDashboardData();

  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const docs = useCounter(stats?.documentsAnalyzed?.value);
  const queries = useCounter(stats?.aiQueries?.value);
  const kbs = useCounter(stats?.knowledgeBases?.value);
  const mins = useCounter(stats?.timeSavedMinutes?.value);

  // Trigger entrance animations
  useEffect(() => {
    if (!isLoading) {
      const elements = document.querySelectorAll('.animate-on-load');
      elements.forEach((el, index) => {
        setTimeout(() => {
          el.classList.add('fade-in-up');
        }, index * 100);
      });
    }
  }, [isLoading]);

  if (error) {
    return (
      <div className="p-8 text-red-500 font-mono">
        Error loading dashboard: {error}
      </div>
    );
  }

  return (
    <main className="dash-body">

      {/* CRAZY HERO SECTION */}
      <section className="dash-hero-extreme animate-on-load">
        <div className="extreme-bg-text">INTELLIGENCE</div>
        
        {/* Abstract Background Elements */}
        <div className="abstract-glow-orb orb-1"></div>
        <div className="abstract-glow-orb orb-2"></div>
        <div className="abstract-grid-overlay"></div>

        <div className="hero-content-wrapper">
          <div className="hero-content-crazy">
            {/* Front Elements */}
            <div className="hero-hud-front">
              <div className="hud-barcode"></div>
              <div className="hud-readout">
                <span>LATENCY: 12MS</span>
                <span className="hud-divider">|</span>
                <span className="neon-text">UPLINK ACTIVE</span>
              </div>
            </div>

            <h1 className="hero-title-crazy">
              {greet}, <br/><span className="neon-text glow-hover">{name.toUpperCase()}</span>
            </h1>
            <p className="hero-sub-crazy text-hover-effect">
              SYSTEM READY. AWAITING YOUR COMMAND TO PROCESS DOCUMENT INTELLIGENCE.
            </p>

            <div className="hero-actions-front">
              <button className="front-btn primary" onClick={() => navigate('/dashboard/documents')}>UPLOAD DOCUMENT</button>
              <button className="front-btn secondary" onClick={() => navigate('/dashboard/chat')}>NEW QUERY</button>
            </div>
          </div>

          <div className="hero-3d-visual">
            <div className="floating-pdf-container">
              <div className="pdf-page pdf-back"></div>
              <div className="pdf-page pdf-mid"></div>
              <div className="pdf-page pdf-front">
                <div className="pdf-scanner"></div>
                <div className="pdf-header"></div>
                <div className="pdf-line w-80"></div>
                <div className="pdf-line w-60"></div>
                <div className="pdf-line w-90"></div>
                <div className="pdf-line w-40"></div>
                <div className="pdf-block"></div>
                <div className="pdf-signature"></div>
              </div>
              <div className="pdf-glow"></div>
            </div>
          </div>
        </div>
      </section>

      {/* CRAZY STATS GRID */}
      {isLoading ? <SkeletonDataBar /> : (
        <section className="stats-grid-crazy animate-on-load" style={{animationDelay: '0.1s'}}>
          <div className="stat-card-crazy">
            <div className="stat-val-crazy">{docs}<span className="neon-text">+</span></div>
            <div className="stat-lbl-crazy">DOCUMENTS ANALYZED</div>
            <div className="stat-bg-shape s1"/>
          </div>
          <div className="stat-card-crazy">
            <div className="stat-val-crazy">{queries}<span className="neon-text">+</span></div>
            <div className="stat-lbl-crazy">AI QUERIES EXECUTED</div>
            <div className="stat-bg-shape s2"/>
          </div>
          <div className="stat-card-crazy active-stat">
            <div className="stat-val-crazy">{kbs}</div>
            <div className="stat-lbl-crazy">ACTIVE KNOWLEDGE BASES</div>
            <div className="stat-bg-shape s3"/>
            <div className="stat-scan-line"/>
          </div>
          <div className="stat-card-crazy">
            <div className="stat-val-crazy">{mins}<span className="neon-text">m</span></div>
            <div className="stat-lbl-crazy">ESTIMATED TIME SAVED</div>
            <div className="stat-bg-shape s4"/>
          </div>
        </section>
      )}

      {/* CRAZY PANELS */}
      <div className="panels-container-crazy animate-on-load" style={{animationDelay: '0.2s'}}>
        
        {/* Activity Log */}
        <div className="crazy-panel hover-lift-panel">
          <div className="crazy-panel-header">
            <div className="panel-title-group">
              <span className="panel-icon">◎</span>
              <span className="panel-title">SYS.ACTIVITY_LOG</span>
            </div>
            <div className="panel-decor-lines">
              <div className="line l1"/><div className="line l2"/><div className="line l3"/>
            </div>
          </div>
          <div className="crazy-panel-body">
            {isLoading ? <SkeletonList /> : (
              <div className="activity-list-crazy">
                {activity?.map((act, i) => (
                  <div key={act.id} className="activity-item-crazy" style={{animationDelay: `${i * 0.1}s`}}>
                    <div className="act-type-badge">{act.type}</div>
                    <div className="act-details">
                      <strong>{act.title}</strong>
                      <span>{act.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* AI Insights Console */}
        <div className="crazy-panel hover-lift-panel ai-panel-special">
          <div className="crazy-panel-header">
            <div className="panel-title-group">
              <span className="panel-icon neon-text">✦</span>
              <span className="panel-title neon-text">AI.INSIGHTS_CONSOLE</span>
            </div>
          </div>
          <div className="crazy-panel-body flex-col">
            {isLoading ? <SkeletonList count={2} /> : (
              <>
                <div className="insights-feed-crazy">
                  {insights?.map(insight => (
                    <div key={insight.id} className="insight-card-crazy">
                      <div className="insight-glint"/>
                      <strong className="text-hover-effect">{insight.title}</strong>
                      <p className="text-hover-effect">{insight.description}</p>
                      <button
                        className="insight-action-btn"
                        onClick={() => {
                          if (insight.actionLabel === 'Go to Documents' || insight.actionLabel === 'Upload Now') navigate('/dashboard/documents');
                          else if (insight.actionLabel === 'Start Chat') navigate('/dashboard/chat');
                        }}
                      >
                        {insight.actionLabel} →
                      </button>
                    </div>
                  ))}
                </div>
                <div className="ai-command-input mt-auto">
                  <span className="prompt-arrow">{'>'}</span>
                  <input type="text" placeholder="ENTER QUERY PARAMETERS..." readOnly />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

    </main>
  );
};

export default DashboardHome;
