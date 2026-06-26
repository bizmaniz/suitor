const ENTITY_MAP = {
  amp: '&',
  quot: '"',
  '#39': "'",
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  '#x2f': '/',
  '#x2b': '+',
};

export function decodeHtmlEntities(value = '') {
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, entity) => {
    const key = entity.toLowerCase();
    if (key.startsWith('#x')) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith('#')) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return Object.hasOwn(ENTITY_MAP, key) ? ENTITY_MAP[key] : match;
  });
}

export function stripHtmlTags(value = '') {
  const text = String(value || '');
  let out = '';
  let inTag = false;
  let dropping = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (dropping && !inTag) {
      const closing = `</${dropping}>`;
      if (text.slice(i, i + closing.length).toLowerCase() === closing) {
        i += closing.length - 1;
        dropping = '';
        continue;
      }
      continue;
    }
    if (!inTag && ch === '<') {
      const rest = text.slice(i + 1).toLowerCase();
      if (rest.startsWith('script')) dropping = 'script';
      if (rest.startsWith('style')) dropping = 'style';
      if (rest.startsWith('noscript')) dropping = 'noscript';
      inTag = true;
      out += ' ';
      continue;
    }
    if (inTag) {
      if (ch === '>') inTag = false;
      continue;
    }
    out += ch;
  }
  return out;
}

export function htmlToPlainText(value = '') {
  return decodeHtmlEntities(stripHtmlTags(value)).replace(/\s+/g, ' ').trim();
}
