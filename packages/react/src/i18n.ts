/**
 * Lightweight, dependency-free internationalization. Holds the active
 * {@link Locale} (messages + numeric separators), resolves message keys with
 * `{name}` interpolation, and formats numbers with manual digit grouping so the
 * output is deterministic regardless of the host's `Intl` locale data.
 *
 * The module is pure (no DOM, no React, no `Intl`) and therefore fully
 * unit-testable on its own; the React layer subscribes to locale changes.
 */

export interface Locale {
  id: string;
  messages: Record<string, string>;
  decimalSep: string;
  groupSep: string;
}

/** English (United States): `.` decimal, `,` grouping. */
export const enUS: Locale = {
  id: 'en-US',
  decimalSep: '.',
  groupSep: ',',
  messages: {
    'menu.copy': 'Copy',
    'menu.paste': 'Paste',
    'menu.cut': 'Cut',
    'menu.delete': 'Delete',
    'cell.error': 'Error in {name}',
  },
};

/** Japanese (Japan): `.` decimal, `,` grouping, Japanese messages. */
export const jaJP: Locale = {
  id: 'ja-JP',
  decimalSep: '.',
  groupSep: ',',
  messages: {
    'menu.copy': 'コピー',
    'menu.paste': '貼り付け',
    'menu.cut': '切り取り',
    'menu.delete': '削除',
    'cell.error': '{name} でエラー',
  },
};

type Listener = () => void;

export class I18n {
  private locale: Locale;
  private readonly listeners = new Set<Listener>();

  constructor(locale: Locale = enUS) {
    this.locale = locale;
  }

  /** Replace the active locale and notify subscribers. */
  setLocale(locale: Locale): void {
    this.locale = locale;
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** The currently active locale. */
  getLocale(): Locale {
    return this.locale;
  }

  /**
   * Look up a message by key. Unknown keys return the key itself. `{name}`
   * placeholders are replaced by matching `params`; placeholders with no
   * matching param are left untouched.
   */
  t(key: string, params?: Record<string, string | number>): string {
    const template = this.locale.messages[key] ?? key;
    if (params === undefined) {
      return template;
    }
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = params[name];
      return value === undefined ? match : String(value);
    });
  }

  /**
   * Format a number with the locale's group/decimal separators. Grouping is
   * applied manually (every three integer digits) so the result does not depend
   * on host `Intl` data. Negatives and rounding are handled; `fractionDigits`
   * defaults to "as-is" (no forced decimals).
   */
  formatNumber(value: number, fractionDigits?: number): string {
    const negative = value < 0;
    const abs = Math.abs(value);

    let fixed: string;
    if (fractionDigits === undefined) {
      fixed = String(abs);
    } else {
      fixed = abs.toFixed(fractionDigits);
    }

    const dotIndex = fixed.indexOf('.');
    const intPart = dotIndex === -1 ? fixed : fixed.slice(0, dotIndex);
    const fracPart = dotIndex === -1 ? '' : fixed.slice(dotIndex + 1);

    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, this.locale.groupSep);
    const body = fracPart === '' ? grouped : `${grouped}${this.locale.decimalSep}${fracPart}`;
    return negative ? `-${body}` : body;
  }

  /** Subscribe to locale changes; returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
