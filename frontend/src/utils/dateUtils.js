/**
 * Date and time range helpers for IOC Hunt.
 */

// Formats a Date to "YYYY-MM-DD HH:mm:ss" in local time
export function formatLocalISO(date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

// Returns { from, to } for today starting from 00:00:00 up to the current time
export function getTodayStartAndEnd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const from = `${y}-${m}-${day} 00:00:00`;
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const to = `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
  return { from, to };
}
