import { describe, it, expect } from 'vitest';
import {
  toClipboardText,
  toClipboardHtml,
  parseClipboard,
  parseHtmlTable,
} from './clipboard.js';

describe('toClipboardText', () => {
  it('produces TSV', () => {
    expect(toClipboardText([['a', 'b'], ['1', '2']])).toBe('a\tb\r\n1\t2');
  });
});

describe('toClipboardHtml', () => {
  it('produces an HTML table and escapes content', () => {
    const html = toClipboardHtml([['<b>', 'a&b']]);
    expect(html).toBe('<table><tbody><tr><td>&lt;b&gt;</td><td>a&amp;b</td></tr></tbody></table>');
  });
});

describe('parseHtmlTable', () => {
  it('extracts cells from rows', () => {
    const html = '<table><tr><td>1</td><td>2</td></tr><tr><th>a</th><td>b</td></tr></table>';
    expect(parseHtmlTable(html)).toEqual([
      ['1', '2'],
      ['a', 'b'],
    ]);
  });

  it('decodes entities and strips inner tags', () => {
    const html = '<tr><td><span>a&amp;b</span></td><td>x&lt;y</td></tr>';
    expect(parseHtmlTable(html)).toEqual([['a&b', 'x<y']]);
  });

  it('converts <br> to newlines', () => {
    expect(parseHtmlTable('<tr><td>a<br>b</td></tr>')).toEqual([['a\nb']]);
  });

  it('handles cell attributes', () => {
    expect(parseHtmlTable('<tr><td style="x">v</td></tr>')).toEqual([['v']]);
  });
});

describe('parseClipboard', () => {
  it('prefers HTML when it contains a table', () => {
    const result = parseClipboard({
      text: 'ignored',
      html: '<table><tr><td>a</td><td>b</td></tr></table>',
    });
    expect(result).toEqual([['a', 'b']]);
  });

  it('falls back to TSV text', () => {
    expect(parseClipboard({ text: 'a\tb\tc' })).toEqual([['a', 'b', 'c']]);
  });

  it('ignores non-table HTML and uses text', () => {
    expect(parseClipboard({ text: 'a\tb', html: '<div>nope</div>' })).toEqual([['a', 'b']]);
  });

  it('returns empty when nothing usable is provided', () => {
    expect(parseClipboard({})).toEqual([]);
    expect(parseClipboard({ html: '   ' })).toEqual([]);
  });

  it('round-trips a matrix through HTML', () => {
    const matrix = [['a', 'b'], ['c', 'd']];
    const html = toClipboardHtml(matrix);
    expect(parseClipboard({ html })).toEqual(matrix);
  });
});
