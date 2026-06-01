import { useRef } from 'react';
import { GridController, type GridControllerOptions } from './controller.js';

/**
 * Create a stable {@link GridController} that lives for the component's lifetime.
 * Pass the returned controller to {@link LatticaGrid}, or drive it directly.
 */
export function useGridController(options: GridControllerOptions): GridController {
  const ref = useRef<GridController | null>(null);
  if (ref.current === null) {
    ref.current = new GridController(options);
  }
  return ref.current;
}
