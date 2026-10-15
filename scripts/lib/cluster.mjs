// Group reports of the same event from different outlets ("covered by 4 sources").

const STOP_EN = new Set(`a an the of in on at to for from by with and or but as is are was were be been being has have had
it its this that these those after before over under into amid about against says said say new news live latest update
updates how why what who when where will would could can may might not no more than up down out off first last year years
day days week weeks month time people man woman men women says report reports amid also just over two three four five
watch video audio pictures photos analysis opinion explainer`.split(/\s+/));

const PUNCT_ZH = /[\s，。、；：？！“”‘’（）《》【】「」『』·…—\-,.;:?!'"()[\]{}|/\\]/;

function stem(w) {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 6 && w.endsWith('ing')) return w.slice(0, -3);
  return w;
}

export function signature(title, lang) {
  const sig = new Set();
  if (lang.startsWith('zh')) {
    const chars = [...title].filter((c) => !PUNCT_ZH.test(c));
    for (let i = 0; i < chars.length - 1; i++) sig.add(chars[i] + chars[i + 1]);
  } else {
    for (const raw of title.toLowerCase().replace(/[’']s\b/g, '').split(/[^a-z0-9À-ɏ]+/)) {
      if (raw.length < 3 || STOP_EN.has(raw)) continue;
      sig.add(stem(raw));
    }
  }
  return sig;
}

function overlap(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return { inter, jac: inter / (a.size + b.size - inter || 1), ovl: inter / (Math.min(a.size, b.size) || 1) };
}

/**
 * Assign `story.cluster` (id of the earliest story in its group). Stories are compared only within
 * the same language, within 30 hours of each other and with a compatible location.
 */
export function clusterStories(stories) {
  const sorted = [...stories].sort((a, b) => a.time - b.time);
  const clusters = [];
  for (const s of sorted) {
    const sig = signature(s.title, s.lang);
    const cc = s.loc?.cc ?? null;
    let best = null;
    let bestScore = 0;
    for (let i = clusters.length - 1; i >= 0; i--) {
      const c = clusters[i];
      if (s.time - c.last > 30 * 3600) break;
      if (c.lang !== s.lang || c.sources.has(s.source)) continue;
      if (cc && c.cc && cc !== c.cc) continue;
      const { inter, jac, ovl } = overlap(sig, c.sig);
      const need = s.lang.startsWith('zh') ? 4 : 3;
      if (inter >= need && ovl >= 0.55 && jac >= 0.25 && jac > bestScore) {
        best = c;
        bestScore = jac;
      }
    }
    if (best) {
      s.cluster = best.id;
      best.sources.add(s.source);
      best.last = Math.max(best.last, s.time);
      for (const x of sig) best.sig.add(x);
      best.size++;
      // stories arrive in time order, so the cluster just touched is now the most recent one
      clusters.splice(clusters.indexOf(best), 1);
      clusters.push(best);
    } else {
      s.cluster = s.id;
      clusters.push({ id: s.id, sig, lang: s.lang, cc, last: s.time, sources: new Set([s.source]), size: 1 });
    }
  }
  const sizes = new Map(clusters.map((c) => [c.id, c.sources.size]));
  for (const s of stories) s.coverage = sizes.get(s.cluster) || 1;
  return clusters.length;
}
