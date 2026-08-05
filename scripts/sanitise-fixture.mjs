import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { JSDOM } from 'jsdom';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error('usage: node scripts/sanitise-fixture.mjs <input> <output>');
  process.exit(1);
}

const dom = new JSDOM(readFileSync(inputPath, 'utf8'));
const { document, NodeFilter } = dom.window;

for (const script of document.querySelectorAll('script')) script.remove();
for (const element of document.querySelectorAll('*')) {
  for (const attribute of [...element.attributes]) {
    if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
  }
}

const handles = new Map();
const syntheticHandle = (handle) => {
  if (/^@account\d+$/.test(handle)) return handle;
  const existing = handles.get(handle.toLowerCase());
  if (existing) return existing.replacement;
  const entry = {
    original: handle.slice(1),
    replacement: `@account${String(handles.size + 1).padStart(2, '0')}`,
  };
  handles.set(handle.toLowerCase(), entry);
  return entry.replacement;
};

const walker = document.createTreeWalker(document, NodeFilter.SHOW_TEXT);
for (let node = walker.nextNode(); node; node = walker.nextNode()) {
  for (const handle of node.nodeValue?.match(/@[A-Za-z0-9_]{1,15}/g) ?? []) syntheticHandle(handle);
}
for (const element of document.querySelectorAll('*')) {
  for (const attribute of [...element.attributes]) {
    for (const handle of attribute.value.match(/@[A-Za-z0-9_]{1,15}/g) ?? [])
      syntheticHandle(handle);
  }
}

const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const replaceAccountTokens = (value) => {
  for (const { original, replacement } of handles.values()) {
    value = value.replace(
      new RegExp(`(?<![A-Za-z0-9_])${escaped(original)}(?![A-Za-z0-9_])`, 'gi'),
      replacement.slice(1),
    );
  }
  return value;
};

const rewriteValue = (value) => {
  value = value
    .replace(/https?:\/\/[^\s"'<>]+/gi, (raw) => {
      try {
        const url = new URL(raw);
        url.hostname = 'example.invalid';
        url.port = '';
        url.search = '';
        return url.toString();
      } catch {
        return raw;
      }
    })
    .replace(/@[A-Za-z0-9_]{1,15}/g, syntheticHandle);
  return replaceAccountTokens(value);
};

for (const element of document.querySelectorAll('*')) {
  for (const attribute of [...element.attributes]) {
    attribute.value = rewriteValue(attribute.value);
  }
}
const textWalker = document.createTreeWalker(document, NodeFilter.SHOW_TEXT);
for (let node = textWalker.nextNode(); node; node = textWalker.nextNode()) {
  node.nodeValue = rewriteValue(node.nodeValue ?? '');
}

const posts = [...document.querySelectorAll('article[data-testid="tweet"]')];
if (posts.length === 0) {
  throw new Error('input contains no article[data-testid="tweet"] post elements');
}
for (const post of posts.slice(10)) post.remove();

const sensitiveText = [];
for (const [index, post] of posts.slice(0, 10).entries()) {
  const replacementText = `Synthetic post body ${String(index + 1).padStart(2, '0')}.`;
  for (const text of post.querySelectorAll('[data-testid="tweetText"]')) {
    sensitiveText.push([text.textContent?.trim() ?? '', replacementText]);
    text.textContent = replacementText;
  }

  for (const userName of post.querySelectorAll('[data-testid="User-Name"]')) {
    const values = [...userName.querySelectorAll('div[dir="ltr"]')];
    const handle = values
      .map((node) => node.textContent?.trim() ?? '')
      .find((value) => value.startsWith('@'));
    const displayName = values[0];
    if (handle && displayName) {
      const replacement = syntheticHandle(handle);
      displayName.textContent = `Account ${replacement.slice('@account'.length)}`;
    }
  }
  for (const image of post.querySelectorAll('img[alt]'))
    image.setAttribute('alt', 'Synthetic avatar');
}

const scrubSensitiveText = (value) => {
  for (const [original, replacement] of sensitiveText) {
    if (original) value = value.replaceAll(original, replacement);
  }
  return value;
};
for (const element of document.querySelectorAll('*')) {
  for (const attribute of [...element.attributes])
    attribute.value = scrubSensitiveText(attribute.value);
}
const scrubWalker = document.createTreeWalker(document, NodeFilter.SHOW_TEXT);
for (let node = scrubWalker.nextNode(); node; node = scrubWalker.nextNode()) {
  node.nodeValue = scrubSensitiveText(node.nodeValue ?? '');
}

const output = dom.serialize();
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, output);
console.log(
  `sanitised ${Math.min(posts.length, 10)} posts (${Buffer.byteLength(output)} bytes) to ${outputPath}`,
);
