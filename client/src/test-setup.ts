import "@testing-library/jest-dom";

// Radix UI components use ResizeObserver; polyfill it for jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
