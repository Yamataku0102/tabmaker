import React from 'react';
export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("EB caught:", error, info); }
  render() {
    if (this.state.error) {
      return <div className="p-4 text-red-500 font-bold"><p>Error!</p><pre>{this.state.error.stack}</pre></div>;
    }
    return this.props.children;
  }
}
