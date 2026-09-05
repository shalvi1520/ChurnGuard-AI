import React from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import Button from './Button';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
          <div className="text-center max-w-lg">
            <div className="w-16 h-16 rounded-2xl bg-risk-critical/10 border border-risk-critical/20 flex items-center justify-center mx-auto mb-6">
              <Shield size={28} className="text-risk-critical" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">Something went wrong</h1>
            <p className="text-sm text-text-secondary mb-8 leading-relaxed">
              An unexpected error occurred in the application. Our team has been notified. 
              You can try refreshing the page to see if that resolves the issue.
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-8 text-left bg-bg-tertiary/50 border border-border rounded-lg p-4 overflow-auto max-h-60">
                <p className="text-xs font-semibold text-risk-critical mb-2 font-mono">
                  {this.state.error.toString()}
                </p>
                <pre className="text-[10px] text-text-tertiary font-mono">
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>
            )}

            <Button variant="primary" size="lg" icon={RefreshCw} onClick={this.handleReset}>
              Refresh Application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
