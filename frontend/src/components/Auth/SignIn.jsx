import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from './AuthLayout';

const SignIn = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Supabase login logic will go here
    console.log('Signing in with:', email, password);
  };

  return (
    <AuthLayout>
      <div className="auth-header">
        <h1>Welcome Back.</h1>
        <p>Access your local neural workspaces.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            type="email"
            id="email"
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="auth-options">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#ccc' }}>
            <input type="checkbox" style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }} />
            Remember me
          </label>
          <a href="#/" className="auth-link">Forgot Password?</a>
        </div>

        <button type="submit" className="auth-button">
          Sign In
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: '16px', fontFamily: 'var(--font-body)', fontSize: '15px' }}>
        <span style={{ color: '#888' }}>New to DocuMind? </span>
        <Link to="/signup" className="auth-link" style={{ fontWeight: '600' }}>Create an Account</Link>
      </div>
    </AuthLayout>
  );
};

export default SignIn;
