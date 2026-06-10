import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInspectionView } from "../../lib/content/dom/inspectionView";

const COLLAPSED_MARKER = "…";
const MAX_ATTR_LENGTH = 200;
const MAX_OUTPUT_SIZE = 250_000;

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function pickById(id: string): { el: Element; id: string } {
  const el = document.getElementById(id);
  if (!el) throw new Error(`fixture missing #${id}`);
  return { el, id };
}

describe("buildInspectionView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns an empty string when document.body is missing", () => {
    // Edge-case fallback. Hard to remove <body> in a real document, so just
    // assert the early-return guard exists and behaves.
    const originalBody = document.body;
    Object.defineProperty(document, "body", {
      configurable: true,
      get: () => null,
    });
    try {
      expect(buildInspectionView([])).toBe("");
    } finally {
      Object.defineProperty(document, "body", {
        configurable: true,
        value: originalBody,
      });
    }
  });

  it("stamps element_id on the cloned equivalent of each target", () => {
    setBody(`<div><span id="t">hello</span></div>`);
    const html = buildInspectionView([pickById("t")]);
    expect(html).toContain('element_id="t"');
    expect(html).toContain("hello");
  });

  describe("noise stripping", () => {
    it("removes script / style / noscript / link / meta subtrees", () => {
      setBody(`
        <header><h1 id="t">Title</h1></header>
        <script>alert('boom');</script>
        <style>.x { color: red; }</style>
        <noscript>fallback</noscript>
      `);
      // Also inject a <link> and <meta> via DOM API since the parser may
      // hoist them out of innerHTML.
      const link = document.createElement("link");
      link.setAttribute("rel", "stylesheet");
      document.body.appendChild(link);
      const meta = document.createElement("meta");
      meta.setAttribute("name", "x");
      document.body.appendChild(meta);

      const html = buildInspectionView([pickById("t")]);

      expect(html).not.toContain("alert('boom')");
      expect(html).not.toContain("color: red");
      expect(html).not.toContain("fallback");
      expect(html).not.toContain("<link");
      expect(html).not.toContain("<meta");
    });
  });

  describe("attribute truncation", () => {
    it("truncates attribute values longer than MAX_ATTR_LENGTH with a marker", () => {
      const longValue = "x".repeat(MAX_ATTR_LENGTH + 50);
      setBody(`<div data-big="${longValue}"><span id="t">target</span></div>`);

      const html = buildInspectionView([pickById("t")]);

      expect(html).not.toContain(longValue);
      // The exact truncation length + marker.
      expect(html).toContain(
        `data-big="${"x".repeat(MAX_ATTR_LENGTH)}${COLLAPSED_MARKER}"`
      );
    });

    it("leaves short attribute values alone", () => {
      setBody(`<div data-small="ok"><span id="t">target</span></div>`);
      const html = buildInspectionView([pickById("t")]);
      expect(html).toContain('data-small="ok"');
    });
  });

  describe("ancestor + sibling-window preservation", () => {
    it("preserves every ancestor on the chain from target to body", () => {
      setBody(`
        <main>
          <section>
            <article>
              <p id="t">deep</p>
            </article>
          </section>
        </main>
      `);

      const html = buildInspectionView([pickById("t")]);

      expect(html).toContain("<main");
      expect(html).toContain("<section");
      expect(html).toContain("<article");
      expect(html).toContain('id="t"');
    });

    it("keeps siblings within SIBLING_RADIUS (=3) of the target's ancestor and collapses farther ones", () => {
      // 8 siblings; target at index 0. Indices 0..3 should be preserved
      // (target + 3-radius window), indices 4..7 should be collapsed. Each
      // far <li> wraps its label in <span> so it doesn't qualify for the
      // "short single text child" preservation affordance.
      setBody(`
        <ul>
          <li id="t" data-i="0">target</li>
          <li data-i="1">near-1</li>
          <li data-i="2">near-2</li>
          <li data-i="3">near-3</li>
          <li data-i="4"><span>far-4</span></li>
          <li data-i="5"><span>far-5</span></li>
          <li data-i="6"><span>far-6</span></li>
          <li data-i="7"><span>far-7</span></li>
        </ul>
      `);

      const html = buildInspectionView([pickById("t")]);

      expect(html).toContain("near-1");
      expect(html).toContain("near-2");
      expect(html).toContain("near-3");
      // Indices outside the window have their text replaced by the collapse
      // marker (their tags + attributes are kept as a structural skeleton).
      expect(html).not.toContain("far-4");
      expect(html).not.toContain("far-7");
      expect(html).toContain(COLLAPSED_MARKER);
      // Skeleton retained: the <li data-i="7"> tag survives even though its
      // body is collapsed.
      expect(html).toContain('data-i="7"');
    });

    it("collapses non-relevant subtrees to the marker while keeping the tag + attributes", () => {
      // `<p>` and `<ul>` below have element children (not a single short
      // text), so they don't qualify for the "keep tiny leaves" affordance
      // and their bodies should be replaced by the collapse marker.
      setBody(`
        <main>
          <aside class="noise">
            <p><span>irrelevant content</span></p>
            <ul>
              <li><span>also irrelevant</span></li>
            </ul>
          </aside>
          <article>
            <p id="t">target</p>
          </article>
        </main>
      `);

      const html = buildInspectionView([pickById("t")]);

      expect(html).toContain('class="noise"'); // skeleton kept
      expect(html).not.toContain("irrelevant content"); // body collapsed
      expect(html).not.toContain("also irrelevant");
      expect(html).toContain(COLLAPSED_MARKER);
    });

    it("preserves a short single-text-node child even when its parent would otherwise collapse", () => {
      // The "keep tiny leaves" affordance — a NON-relevant element with a
      // single short text child stays intact so the LLM sees the word. The
      // outer <aside> is in the sibling window of <article>, but its inner
      // <p> is not on the relevant set; the affordance is what keeps the
      // text visible.
      setBody(`
        <main>
          <aside class="wrap">
            <p>short leaf text</p>
          </aside>
          <article>
            <p id="t">target</p>
          </article>
        </main>
      `);

      const html = buildInspectionView([pickById("t")]);

      expect(html).toContain("short leaf text");
    });
  });

  describe("multi-target", () => {
    it("stamps element_id on each target and keeps every target reachable", () => {
      setBody(`
        <ul>
          <li id="a">A</li>
          <li id="b">B</li>
          <li id="c">C</li>
        </ul>
      `);

      const html = buildInspectionView([
        pickById("a"),
        pickById("b"),
        pickById("c"),
      ]);

      expect(html).toContain('element_id="a"');
      expect(html).toContain('element_id="b"');
      expect(html).toContain('element_id="c"');
    });
  });

  describe("output cap", () => {
    it("truncates output to MAX_OUTPUT_SIZE and appends a truncation comment", () => {
      // Build a body whose pre-collapse output blows past MAX_OUTPUT_SIZE. A
      // big string in a *target's* attribute survives attribute-truncation
      // (200 chars) but the surrounding skeleton fills the rest. We use a
      // single huge text node on the target — long text on the target's own
      // element is preserved (it's relevant + a single text child).
      const giant = "z".repeat(MAX_OUTPUT_SIZE + 1_000);
      setBody(`<div><span id="t">${giant}</span></div>`);

      const html = buildInspectionView([pickById("t")]);

      expect(html.length).toBeLessThanOrEqual(
        MAX_OUTPUT_SIZE + "\n<!-- inspection view truncated -->".length
      );
      expect(html.endsWith("<!-- inspection view truncated -->")).toBe(true);
    });
  });

  describe("read-only", () => {
    it("does not mutate the source DOM (no element_id on the live page, no scripts removed)", () => {
      setBody(`
        <script id="keep-me">var x = 1;</script>
        <div><span id="t">target</span></div>
      `);

      const before = document.body.innerHTML;
      buildInspectionView([pickById("t")]);
      const after = document.body.innerHTML;

      expect(after).toBe(before);
      // The live target keeps no `element_id` stamp.
      expect(document.getElementById("t")?.hasAttribute("element_id")).toBe(
        false
      );
      // The live <script> survives.
      expect(document.getElementById("keep-me")).not.toBeNull();
    });

    it("is idempotent — two calls on the same DOM produce identical output", () => {
      setBody(`
        <main>
          <article>
            <p id="t">target</p>
          </article>
        </main>
      `);
      const first = buildInspectionView([pickById("t")]);
      const second = buildInspectionView([pickById("t")]);
      expect(second).toBe(first);
    });
  });
});
