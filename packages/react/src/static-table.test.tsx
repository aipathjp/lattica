import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ColumnNode } from '@ai-path/tb-core';
import { GridController } from './controller.js';
import { renderStaticTable, staticTablePrintCss } from './static-table.js';

function markup(controller: GridController, columns?: readonly ColumnNode[], options = {}): string {
  return renderToStaticMarkup(renderStaticTable(controller, columns, options));
}

function seededController(): GridController {
  const controller = new GridController({ rowCount: 4, colCount: 3, defaultColWidth: 80, rowHeaderWidth: 36 });
  controller.setCellText(0, 0, 'Apple');
  controller.setCellText(0, 1, '10');
  controller.setCellText(0, 2, '=B1*2');
  controller.setCellText(1, 0, 'Banana');
  controller.setCellText(1, 1, '5');
  controller.setCellText(1, 2, '=B2*2');
  controller.setCellText(2, 0, 'Cherry');
  controller.setCellText(2, 1, '20');
  controller.setCellText(2, 2, '=B3*2');
  controller.setCellText(3, 0, 'Date');
  controller.setCellText(3, 1, '1');
  controller.setCellText(3, 2, '=B4*2');
  return controller;
}

describe('renderStaticTable', () => {
  it('renders display values, current column widths, and column alignment', () => {
    const controller = seededController();
    controller.setColumnWidth(1, 144);
    controller.setColumnAlign(1, 'right');
    const html = markup(controller);

    expect(html).toContain('data-testid="lattica-static-table"');
    expect(html).toContain('class="lattica-static-table"');
    expect(html).toContain('<col style="width:144px"/>');
    expect(html).toContain('<td style="text-align:right">10</td>');
    expect(html).toContain('<td>20</td>');
  });

  it('reflects sorted, filtered, and hidden visual state', () => {
    const controller = seededController();
    controller.toggleSort(1);
    controller.setColumnFilter(1, [{ kind: 'gt', value: 5 }]);
    controller.hideColumn(0);
    const html = markup(controller);

    expect(html).not.toContain('Apple');
    expect(html).not.toContain('Banana');
    expect(html).toContain('<td>10</td>');
    expect(html).toContain('<td>20</td>');
    expect(html).toContain('<td>40</td>');
    expect(html.indexOf('<td>10</td>')).toBeLessThan(html.indexOf('<td>20</td>'));
  });

  it('recreates multi-level headers with colSpan and rowSpan', () => {
    const controller = seededController();
    const columns: readonly ColumnNode[] = [
      { headerName: 'Item' },
      {
        headerName: 'Metrics',
        children: [{ headerName: 'Qty' }, { headerName: 'Total' }],
      },
    ];
    const html = markup(controller, columns);

    expect(html).toContain('<th scope="col" colSpan="2" rowSpan="1">Metrics</th>');
    expect(html).toContain('<th scope="col" colSpan="1" rowSpan="2">Item</th>');
    expect(html).toContain('<th scope="col" colSpan="1" rowSpan="1">Qty</th>');
    expect(html).toContain('<th scope="col" colSpan="1" rowSpan="1">Total</th>');
  });

  it('drops grouped header cells whose leaves are all hidden', () => {
    const controller = seededController();
    controller.hideColumn(1);
    controller.hideColumn(1);
    const columns: readonly ColumnNode[] = [
      { headerName: 'Item' },
      {
        headerName: 'Metrics',
        children: [{ headerName: 'Qty' }, { headerName: 'Total' }],
      },
    ];
    const html = markup(controller, columns);

    expect(html).toContain('>Item</th>');
    expect(html).not.toContain('>Metrics</th>');
    expect(html).not.toContain('>Qty</th>');
    expect(html).not.toContain('>Total</th>');
  });

  it('falls back to letter headers when columns are omitted', () => {
    const controller = seededController();
    const html = markup(controller);

    expect(html).toContain('>A</th>');
    expect(html).toContain('>B</th>');
    expect(html).toContain('>C</th>');
  });

  it('can include row numbers', () => {
    const controller = seededController();
    const html = markup(controller, undefined, { includeRowNumbers: true });

    expect(html).toContain('<col style="width:36px"/>');
    expect(html).toContain('<th scope="col" rowSpan="1">#</th>');
    expect(html).toContain('<th scope="row">1</th>');
  });

  it('truncates rows with a tfoot summary when maxRows is set', () => {
    const controller = seededController();
    const html = markup(controller, undefined, { maxRows: 2, includeRowNumbers: true });

    expect(html).toContain('<tfoot>');
    expect(html).toContain('<td colSpan="4">+2 more rows</td>');
    expect(html).not.toContain('Cherry');
    expect(html).not.toContain('Date');
  });

  it('renders a caption option', () => {
    const controller = seededController();
    expect(markup(controller, undefined, { caption: 'Printable sheet' })).toContain(
      '<caption>Printable sheet</caption>',
    );
  });

  it('supports omitting headers and custom classes', () => {
    const controller = seededController();
    const html = markup(controller, undefined, { includeHeaders: false, className: 'invoice-print', maxRows: Infinity });

    expect(html).toContain('class="invoice-print"');
    expect(html).not.toContain('<thead>');
    expect(html).not.toContain('<tfoot>');
  });

  it('uses fallback headers when the provided column tree has no visible leaves', () => {
    const controller = seededController();
    const html = markup(controller, [{ headerName: 'Empty', children: [] }]);

    expect(html).toContain('>A</th>');
  });

  it('clamps negative maxRows to zero and reports all rows as remaining', () => {
    const controller = seededController();
    const html = markup(controller, undefined, { maxRows: -1 });

    expect(html).toContain('<tbody></tbody>');
    expect(html).toContain('<td colSpan="3">+4 more rows</td>');
  });
});

describe('staticTablePrintCss', () => {
  it('contains the recommended print rules', () => {
    expect(staticTablePrintCss.length).toBeGreaterThan(0);
    expect(staticTablePrintCss).toContain('.lattica-static-table');
    expect(staticTablePrintCss).toContain('break-inside');
    expect(staticTablePrintCss).toContain('print-color-adjust');
    expect(staticTablePrintCss).toContain('table-header-group');
  });
});
