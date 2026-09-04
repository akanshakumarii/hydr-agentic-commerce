import { Component } from 'react';

// Global error boundary: a crashing component shows a friendly card instead
// of a blank white screen, per the "Reliability" requirement.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error('UI crashed:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="empty-state">
          <h2>Something went a bit wrong</h2>
          <p>This part of the page hit a snag. Try reloading — your cart and account are safe.</p>
          <button onClick={() => window.location.reload()}>Reload page</button>
        </div>
      );
    }
    return this.props.children;
  }
}
