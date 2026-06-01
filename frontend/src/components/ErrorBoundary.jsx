import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '2rem', textAlign: 'center', background: '#111827', color: '#fff' }}>
          <h1 style={{ color: '#EF4444', marginBottom: '1rem' }}>Something went wrong.</h1>
          <p style={{ opacity: 0.8, maxWidth: '600px', marginBottom: '2rem' }}>
            An unexpected error occurred in the application. Please try refreshing the page.
          </p>
          <button 
            onClick={() => window.location.reload()} 
            style={{ padding: '12px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
