// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type ReactModule = typeof import('./index.js');

const controller = (mod: ReactModule) => new mod.GridController({ rowCount: 4, colCount: 3 });

describe('SSR safety', () => {
  it('evaluates the public module graph without DOM globals', async () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    await expect(import('./index.js')).resolves.toBeTruthy();
  });

  it('server-renders grid-adjacent React components without DOM globals', async () => {
    const mod = await import('./index.js');
    const rendered = [
      renderToStaticMarkup(createElement(mod.LatticaGrid, { controller: controller(mod), width: 100, height: 100 })),
      renderToStaticMarkup(createElement(mod.LatticaColumnSettings, { controller: controller(mod) })),
      renderToStaticMarkup(createElement(mod.LatticaStatusBar, { controller: controller(mod) })),
      renderToStaticMarkup(createElement(mod.LatticaFormulaBar, { controller: controller(mod) })),
    ];

    for (const html of rendered) {
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    }
  });
});
