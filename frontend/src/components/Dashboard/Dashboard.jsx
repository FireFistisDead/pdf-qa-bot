import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LandingNavbar from '../Landing/LandingNavbar';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // If someone manually goes to /dashboard and is not logged in, boot them
  React.useEffect(() => {
    if (!user) {
      navigate('/signin');
    }
  }, [user, navigate]);

  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f0f', color: '#fff', fontFamily: 'var(--font-body, "Inter", sans-serif)' }}>
      <LandingNavbar />
      
      <main style={{ padding: '120px 40px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-display, "Space Grotesk", sans-serif)', fontSize: '48px', marginBottom: '16px' }}>
          Welcome back, <span style={{ color: 'var(--accent, #c8ff00)' }}>{user.user_metadata?.full_name || user.email.split('@')[0]}</span>.
        </h1>
        <p style={{ color: '#888', fontSize: '18px', marginBottom: '40px' }}>
          This is your private neural workspace. You are successfully authenticated.
        </p>

        <button 
          onClick={() => navigate('/workspace')}
          style={{
            background: 'var(--accent, #c8ff00)',
            color: '#000',
            border: 'none',
            padding: '16px 32px',
            fontSize: '16px',
            fontWeight: 'bold',
            fontFamily: 'var(--font-mono, monospace)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            cursor: 'pointer',
            borderRadius: '4px',
            marginBottom: '48px',
            boxShadow: '4px 4px 0px rgba(255,255,255,0.2)'
          }}
        >
          Open PDF Intelligence →
        </button>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '24px'
        }}>
          {/* Dummy Dashboard Cards */}
          <div style={{ padding: '32px', background: '#151515', border: '1px solid #333', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '12px' }}>Your Knowledge Bases</h3>
            <p style={{ color: '#aaa', fontSize: '14px' }}>You have 0 active vectors indexed. Upload a PDF to get started.</p>
          </div>

          <div style={{ padding: '32px', background: '#151515', border: '1px solid #333', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '12px' }}>API Usage</h3>
            <p style={{ color: '#aaa', fontSize: '14px' }}>0 queries out of your monthly quota.</p>
          </div>
          
          <div style={{ padding: '32px', background: '#151515', border: '1px solid #333', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '12px' }}>Account Info</h3>
            <p style={{ color: '#aaa', fontSize: '14px' }}>Email: {user.email}</p>
            <p style={{ color: '#aaa', fontSize: '14px', marginTop: '8px' }}>User ID: <span style={{ fontSize: '11px', fontFamily: 'monospace', background: '#000', padding: '4px', borderRadius: '4px' }}>{user.id}</span></p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
