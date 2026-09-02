import '@testing-library/jest-dom/vitest';

/**
 * MapLibre GL needs WebGL — jsdom cannot run it. Component tests mock the
 * MapView component instead; this guard keeps any accidental import from
 * crashing the whole suite.
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContext(): null {
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext;
}

export {};
