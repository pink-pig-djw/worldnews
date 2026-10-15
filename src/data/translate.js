// Chinese for English reports when the interface is in Chinese. Translation runs on the reader's own
// device with the browser's built-in Translator API (desktop Chrome 138+): free, nothing is sent
// anywhere, and results are cached locally so each report is translated once.
import { getLang } from '../i18n.js';

const STORE_KEY = 'wp-tr-v1';
const MAX_CACHED = 3000;
const FLUSH_MS = 1200;

const cache = new Map(); // story id -> [title, summary]
try {
  for (const [id, v] of JSON.parse(localStorage.getItem(STORE_KEY) || '[]')) cache.set(id, v);
} catch {
  /* private mode or corrupt entry: start empty */
}

const state = { status: 'off', progress: 0, translator: null, queue: [], running: false, onChange: () => {} };

/** 'unsupported' | 'off' | 'needs-download' | 'downloading' | 'ready' | 'error' */
export const translationStatus = () => state.status;
export const downloadProgress = () => state.progress;

const wanted = (s) => getLang() === 'zh' && s.lang === 'en';
const entry = (s) => (wanted(s) ? cache.get(s.id) : null);

/** Title to show: the Chinese translation when there is one. */
export const storyTitle = (s) => entry(s)?.[0] || s.title;
export const storySummary = (s) => entry(s)?.[1] || s.summary;
export const isTranslated = (s) => Boolean(entry(s)?.[0]);

function setStatus(status) {
  state.status = status;
  state.onChange('status');
}

/** Check what the browser offers. Downloading a language pack needs a click, see `enableTranslation`. */
export async function initTranslation({ enabled, onChange }) {
  state.onChange = onChange;
  if (!('Translator' in self)) return setStatus('unsupported');
  if (!enabled) return setStatus('off');
  if (state.translator) return setStatus('ready');
  try {
    const a = await self.Translator.availability({ sourceLanguage: 'en', targetLanguage: 'zh' });
    if (a === 'unavailable') return setStatus('unsupported');
    if (a === 'available') return enableTranslation();
    setStatus('needs-download');
  } catch {
    setStatus('unsupported');
  }
}

/** Create the translator (from a click when the language pack still has to be downloaded). */
export async function enableTranslation() {
  if (state.translator) return setStatus('ready');
  setStatus('downloading');
  try {
    state.translator = await self.Translator.create({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          state.progress = e.loaded;
          state.onChange('progress');
        });
      },
    });
    setStatus('ready');
    pump();
  } catch (err) {
    console.warn(err);
    setStatus(self.navigator.userActivation?.isActive === false ? 'needs-download' : 'error');
  }
}

export function disableTranslation() {
  state.queue = [];
  setStatus('Translator' in self ? 'off' : 'unsupported');
}

/** Queue English reports, most important first: every title, then the summaries. */
export function translateStories(stories) {
  if (getLang() !== 'zh') return;
  const en = stories.filter((s) => s.lang === 'en');
  state.queue = [
    ...en.filter((s) => !cache.get(s.id)?.[0]).map((s) => [s, 0]),
    ...en.filter((s) => s.summary && !cache.get(s.id)?.[1]).map((s) => [s, 1]),
  ];
  pump();
}

/** Translate one report right away (e.g. for a notification); resolves when done or after `ms`. */
export function translateNow(s, ms = 1500) {
  if (!state.translator || !wanted(s) || cache.get(s.id)?.[0]) return Promise.resolve();
  const job = state.translator.translate(s.title).then((zh) => {
    cache.set(s.id, [zh, cache.get(s.id)?.[1] ?? null]);
  });
  return Promise.race([job, new Promise((r) => setTimeout(r, ms))]).catch(() => {});
}

async function pump() {
  if (state.running || !state.translator || state.status !== 'ready') return;
  state.running = true;
  let dirty = false;
  let last = performance.now();
  try {
    while (state.queue.length && state.status === 'ready' && getLang() === 'zh') {
      const [s, field] = state.queue.shift();
      const cur = cache.get(s.id) || [null, null];
      if (cur[field]) continue;
      const text = field === 0 ? s.title : s.summary;
      cur[field] = await state.translator.translate(text);
      cache.delete(s.id); // re-insert so the newest entries survive trimming
      cache.set(s.id, cur);
      dirty = true;
      if (performance.now() - last > FLUSH_MS) {
        flush();
        dirty = false;
        last = performance.now();
      }
    }
  } catch (err) {
    console.warn('translation stopped', err);
    setStatus('error');
  } finally {
    state.running = false;
    if (dirty) flush();
  }
}

function flush() {
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...cache]));
  } catch {
    /* quota or private mode: keep the in-memory cache */
  }
  state.onChange('text');
}
