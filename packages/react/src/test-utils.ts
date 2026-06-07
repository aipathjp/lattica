import type { Canvas2D } from './painter.js';

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface MockContext extends Canvas2D {
  calls: RecordedCall[];
  scale(x: number, y: number): void;
}

/** A recording 2D context for asserting paint output without real pixels. */
export function createMockContext(): MockContext {
  const calls: RecordedCall[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  return {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textBaseline: 'alphabetic',
    textAlign: 'start',
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    rect: record('rect'),
    clip: record('clip'),
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    fillText: record('fillText'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    stroke: record('stroke'),
    arc: record('arc'),
    closePath: record('closePath'),
    fill: record('fill'),
    scale: record('scale'),
  };
}
