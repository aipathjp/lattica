// Global Vitest setup. In a DOM environment (happy-dom), stub canvas
// getContext so the grid painter can run without a real rendering backend.
import { createMockContext } from './packages/react/src/test-utils.js';

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContext(): unknown {
    return createMockContext();
  } as typeof HTMLCanvasElement.prototype.getContext;
}
