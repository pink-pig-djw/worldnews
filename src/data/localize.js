// What to show for a report, alert or quake in the current interface language.
import { getLang } from '../i18n.js';

export { storySummary, storyTitle, isTranslated } from './translate.js';

/** A hazard field in Chinese when available ('' means "nothing worth showing"). */
export function hazardText(h, field) {
  if (getLang() === 'zh' && h.zh && h.zh[field] != null) return h.zh[field];
  return h[field];
}

export const quakePlace = (q) => (getLang() === 'zh' && q.placeZh) || q.place;
