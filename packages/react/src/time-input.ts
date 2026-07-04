/** Input helpers for the built-in `time` cell type. */

export function sanitizeTimeDraft(draft: string): string {
  return draft.replace(/[^0-9:]/g, '');
}

export function normalizeTimeInput(raw: string): string | null {
  const text = raw.trim();
  if (text === '') {
    return null;
  }

  let hour: number;
  let minute: number;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (colon !== null) {
    hour = Number(colon[1]);
    minute = Number(colon[2]);
  } else if (/^\d{1,2}$/.test(text)) {
    hour = Number(text);
    minute = 0;
  } else if (/^\d{3}$/.test(text)) {
    hour = Number(text.slice(0, 1));
    minute = Number(text.slice(1));
  } else if (/^\d{4}$/.test(text)) {
    hour = Number(text.slice(0, 2));
    minute = Number(text.slice(2));
  } else {
    return null;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
