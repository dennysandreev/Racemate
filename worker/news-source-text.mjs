// Preserve short paragraphs/headings: they often identify a quote's speaker,
// contain a key number, or qualify the following passage.
export function extractNewsSourceHtml(html, decode = value => value) {
  const body = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const plain = decodeNewsEntities(decode(body
    .replace(/<(script|style|noscript|svg|nav|aside|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(?:p|div|section|article|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")));
  const paragraphs = plain.split(/\n+/).map(line => line.replace(/\s+/g, " ").trim())
    .filter(line => line.length > 1)
    .filter(line => !/^(advertisement|subscribe|sign up|cookies?|privacy policy|terms of use)\b/i.test(line));
  return paragraphs.length ? paragraphs.join("\n\n") : null;
}

export function decodeNewsEntities(value) {
  const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };
  return String(value ?? "").replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? match;
    const number = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return Number.isInteger(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : match;
  });
}

export function extractNewsSourceMarkdown(markdown) {
  let content = String(markdown ?? "");
  // RaceFans reader pages include a long navigation glossary before the article.
  // Keep its date/byline but exclude unrelated sporting facts and related stories.
  if (/^URL Source: https?:\/\/(?:www\.)?racefans\.net\//im.test(content)) {
    const articleStart = content.search(/^Posted on\s*$/im);
    if (articleStart >= 0) content = content.slice(articleStart);
    const articleEnd = content.search(/^(?:Join the discussion here:|Published by|\*\*Browse all Formula 1 articles)/im);
    if (articleEnd >= 0) content = content.slice(0, articleEnd);
  }
  const lines = content.split(/\n+/).map(line => line.trim())
    .filter(line => !/^(Title:|URL Source:|Published Time:|Markdown Content:|Advert\b|Menu and widgets|Follow RaceFans)/i.test(line))
    .map(line => line.replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^#+\s*/, "").replace(/\s+/g, " ").trim())
    .filter(line => line.length > 1);
  return lines.length ? lines.join("\n\n") : null;
}
