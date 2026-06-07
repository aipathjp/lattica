import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { LatticaChart } from './LatticaChart.js';

afterEach(cleanup);

describe('LatticaChart', () => {
  it('renders a canvas with an img role and aria label', () => {
    render(<LatticaChart spec={{ kind: 'bar', series: [{ name: 'S', values: [1, 2, 3] }] }} />);
    const chart = screen.getByTestId('lattica-chart');
    expect(chart.tagName).toBe('CANVAS');
    expect(chart.getAttribute('role')).toBe('img');
    expect(chart.getAttribute('aria-label')).toBe('bar chart');
  });

  it('accepts a custom testid and size and renders line/pie kinds', () => {
    render(
      <LatticaChart
        data-testid="my-chart"
        width={300}
        height={150}
        spec={{ kind: 'line', categories: ['a', 'b'], series: [{ name: 'S', values: [4, 8] }] }}
      />,
    );
    const chart = screen.getByTestId('my-chart') as HTMLCanvasElement;
    expect(chart.style.width).toBe('300px');
    expect(chart.style.height).toBe('150px');
  });

  it('renders a pie chart', () => {
    render(<LatticaChart spec={{ kind: 'pie', series: [{ name: 'S', values: [1, 2] }] }} />);
    expect(screen.getByTestId('lattica-chart')).toBeTruthy();
  });
});
