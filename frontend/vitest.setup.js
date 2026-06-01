import React from 'react';

// Ensure React is available as a global for tests that rely on classic JSX runtime
if (typeof globalThis.React === 'undefined') {
  globalThis.React = React;
}
