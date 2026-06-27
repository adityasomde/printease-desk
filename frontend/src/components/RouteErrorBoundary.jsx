import React, { Component } from "react";

export class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[PrintEase route render failed]", error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const showDetail =
      typeof window !== "undefined" &&
      (window.location.protocol === "file:" ||
        window.location.protocol === "app:" ||
        window.printeaseDesktop?.isDesktop ||
        import.meta.env.DEV);

    return (
      <section className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-rose-700">Page failed to load</h2>
        <p className="mt-2 text-slate-600">PrintEase hit a renderer error while opening this page.</p>
        {showDetail && (
          <pre className="mt-4 overflow-x-auto rounded-xl bg-rose-50 p-4 text-xs text-rose-800">
            {this.state.error?.message || String(this.state.error)}
          </pre>
        )}
      </section>
    );
  }
}
