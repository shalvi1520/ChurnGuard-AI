import '@testing-library/jest-dom';

// jsdom has no ResizeObserver, and Recharts' ResponsiveContainer constructs one
// on mount. Charts measure 0x0 here (nothing is laid out), which is fine: the
// chart tests assert on the HTML around the SVG, not on the SVG itself.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
