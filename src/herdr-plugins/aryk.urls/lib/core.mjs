const URL_PATTERN = /https?:\/\/[^\s<>"'`\x00-\x1f\x7f]+/giu;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/u;
const CLOSERS = new Map([[")", "("], ["]", "["], ["}", "{"]]);

function trimUrl(candidate) {
  let value = candidate.replace(TRAILING_PUNCTUATION, "");
  while (CLOSERS.has(value.at(-1))) {
    const close = value.at(-1); const open = CLOSERS.get(close);
    const opens = [...value].filter(character => character === open).length;
    const closes = [...value].filter(character => character === close).length;
    if (closes <= opens) break;
    value = value.slice(0, -1);
  }
  return value;
}

export function extractUrls(text) {
  const urls = []; const seen = new Set();
  for (const match of String(text).matchAll(URL_PATTERN)) {
    const value = trimUrl(match[0]);
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || seen.has(value)) continue;
      seen.add(value); urls.push(value);
    } catch {}
  }
  return urls.reverse();
}

export function displayUrl(url) {
  const parsed = new URL(url);
  return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}${parsed.search}${parsed.hash}`.replace(/[\t\r\n]/g, " ");
}

export function parseSelection(output, urls) {
  const index = Number.parseInt(String(output).split("\t", 1)[0], 10);
  if (!Number.isSafeInteger(index) || index < 1 || index > urls.length) throw new Error("URL picker returned an unknown selection");
  return urls[index - 1];
}
