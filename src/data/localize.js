// What to show for a report, event, alert or quake in the current interface language.
import { getLang } from '../i18n.js';
import { storyTitle } from './translate.js';

export { storySummary, storyTitle, isTranslated } from './translate.js';

/** A hazard field in Chinese when available ('' means "nothing worth showing"). */
export function hazardText(h, field) {
  if (getLang() === 'zh' && h.zh && h.zh[field] != null) return h.zh[field];
  return h[field];
}

export const quakePlace = (q) => (getLang() === 'zh' && q.placeZh) || q.place;

/**
 * The report whose headline stands for an event: in the reader's language when an independent
 * outlet wrote one; a Chinese headline from state media gives way to a (translated) independent one.
 */
export function eventStory(e) {
  if (getLang() === 'zh') return e.leadZh && (!e.leadZh.state || e.lead.state) ? e.leadZh : e.lead;
  return e.leadEn || e.lead;
}

export const eventTitle = (e) => storyTitle(eventStory(e));
