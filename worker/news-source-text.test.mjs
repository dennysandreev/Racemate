import assert from "node:assert/strict";
import test from "node:test";
import { extractNewsSourceHtml, extractNewsSourceMarkdown, decodeNewsEntities } from "./news-source-text.mjs";

test("source extraction keeps short speaker names, numbers and caveats", () => {
  const text = extractNewsSourceHtml('<article><nav>Subscribe here</nav><h2>FIA proposal</h2><p>Jon Noble</p><p>The FIA is considering a change.</p><blockquote>Not yet approved.</blockquote><p>Four sessions.</p><script>ignore source</script></article>');
  assert.match(text, /Jon Noble\n\nThe FIA/);
  assert.match(text, /Not yet approved/);
  assert.match(text, /Four sessions/);
  assert.doesNotMatch(text, /Subscribe here|ignore source/);
});

test("reader fallback preserves linked decision makers and author headings", () => {
  const text = extractNewsSourceMarkdown('Title: Page\n## Jon Noble\n[The FIA](https://fia.com) is considering changes.\nNot yet approved.\n![image](https://example.com/image.jpg)');
  assert.match(text, /^Jon Noble\n\nThe FIA is considering changes/);
  assert.match(text, /Not yet approved/);
  assert.doesNotMatch(text, /image.jpg|Title:/);
});

test("HTML quotes remain usable as exact source evidence", () => {
  assert.equal(decodeNewsEntities("F1&#8217;s &ldquo;proposal&rdquo;"), "F1’s “proposal”");
  assert.equal(extractNewsSourceHtml("<article><p>&#x201c;No decision&#x201d;</p></article>"), "“No decision”");
});

test("RaceFans reader excludes navigation and related news before selecting context", () => {
  const result = extractNewsSourceMarkdown('URL Source: https://www.racefans.net/2026/article\nMenu: Hamilton Mercedes 2025\nPosted on\n18 September | Written by Keith Collantine\nOne fan stopped watching.\nJoin the discussion here:\nUnrelated article: 30 races\nPublished by\nAuthor biography');
  assert.match(result, /Keith Collantine/);
  assert.match(result, /One fan stopped watching/);
  assert.doesNotMatch(result, /Mercedes|30 races|biography/);
});
