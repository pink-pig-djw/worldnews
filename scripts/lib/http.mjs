const UA = 'Mozilla/5.0 (compatible; WorldPulseBot/1.0; +https://github.com/pink-pig-djw/worldnews)';

function sniffCharset(buf, contentType) {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType || '');
  if (fromHeader) return fromHeader[1];
  const head = new TextDecoder('latin1').decode(buf.subarray(0, 200));
  const fromXml = /encoding=["']([\w-]+)["']/i.exec(head);
  return fromXml ? fromXml[1] : 'utf-8';
}

/**
 * GET a URL and decode it to text, honouring the feed's declared charset (GBK, Big5, ...).
 * Retries once on network errors and 5xx responses.
 */
export async function fetchText(url, { timeoutMs = 20000, accept, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'user-agent': UA,
          accept: accept || 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*;q=0.8',
          'accept-language': 'en,zh-CN;q=0.8,zh;q=0.7',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        if (res.status >= 500 && attempt < retries) {
          lastErr = err;
          continue;
        }
        throw err;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      let charset = sniffCharset(buf, res.headers.get('content-type'));
      if (/^gb2312$/i.test(charset)) charset = 'gbk';
      let text;
      try {
        text = new TextDecoder(charset).decode(buf);
      } catch {
        text = new TextDecoder('utf-8').decode(buf);
      }
      return text.replace(/^﻿/, '');
    } catch (err) {
      lastErr = err;
      if (err.status && err.status < 500) break;
    }
  }
  throw lastErr;
}

export async function fetchJson(url, opts) {
  return JSON.parse(await fetchText(url, { accept: 'application/json', ...opts }));
}
