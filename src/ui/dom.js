export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Only allow http(s) links from feeds. */
export const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? esc(u) : '#');

export function fmtTime(sec, opts = {}) {
  const d = new Date(sec * 1000);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', ...opts });
}

export function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

export function sevLevel(sev) {
  return sev >= 0.8 ? 4 : sev >= 0.62 ? 3 : sev >= 0.45 ? 2 : 1;
}
