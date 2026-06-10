import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ElementRegistry,
  queryAll,
  resolvesExactlyTo,
} from "../../lib/content/dom/elementRegistry";

function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe("queryAll", () => {
  beforeEach(() => {
    setBody(`
      <ul id="list">
        <li class="item" id="a">A</li>
        <li class="item" id="b">B</li>
        <li class="item" id="c">C</li>
      </ul>
      <div id="other" class="item">other</div>
    `);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("css", () => {
    it("returns matching elements in document order", () => {
      const matches = queryAll({ type: "css", value: ".item" }, document);
      expect(matches.map((el) => el.id)).toEqual(["a", "b", "c", "other"]);
    });

    it("returns an empty array when nothing matches", () => {
      expect(queryAll({ type: "css", value: ".nope" }, document)).toEqual([]);
    });

    it("returns [] for a malformed selector instead of throwing", () => {
      // `:::not-a-selector` is an invalid pseudo — querySelectorAll throws
      // SyntaxError; the helper swallows it.
      expect(() =>
        queryAll({ type: "css", value: ":::garbage" }, document)
      ).not.toThrow();
      expect(queryAll({ type: "css", value: ":::garbage" }, document)).toEqual(
        []
      );
    });
  });

  describe("xpath", () => {
    it("evaluates a relative xpath and returns matches in document order", () => {
      const matches = queryAll(
        { type: "xpath", value: "//li[@class='item']" },
        document
      );
      expect(matches.map((el) => el.id)).toEqual(["a", "b", "c"]);
    });

    it("evaluates an absolute xpath", () => {
      const matches = queryAll(
        { type: "xpath", value: "/html/body/ul[@id='list']/li[1]" },
        document
      );
      expect(matches.map((el) => el.id)).toEqual(["a"]);
    });

    it("returns [] for a malformed xpath instead of throwing", () => {
      expect(() =>
        queryAll({ type: "xpath", value: "///[[[" }, document)
      ).not.toThrow();
      expect(queryAll({ type: "xpath", value: "///[[[" }, document)).toEqual(
        []
      );
    });
  });
});

describe("resolvesExactlyTo", () => {
  beforeEach(() => {
    setBody(`
      <li id="a" class="row"></li>
      <li id="b" class="row"></li>
      <li id="c" class="row"></li>
    `);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is true when the selector matches exactly the expected set (order-insensitive)", () => {
    const a = document.getElementById("a")!;
    const b = document.getElementById("b")!;
    const c = document.getElementById("c")!;
    expect(
      resolvesExactlyTo({ type: "css", value: ".row" }, [c, a, b], document)
    ).toBe(true);
  });

  it("is false when the selector matches a superset", () => {
    const a = document.getElementById("a")!;
    expect(
      resolvesExactlyTo({ type: "css", value: ".row" }, [a], document)
    ).toBe(false);
  });

  it("is false when the selector misses a required element", () => {
    const a = document.getElementById("a")!;
    const b = document.getElementById("b")!;
    const c = document.getElementById("c")!;
    expect(
      resolvesExactlyTo({ type: "css", value: "#a, #b" }, [a, b, c], document)
    ).toBe(false);
  });

  it("is false when the expected set is empty (degenerate)", () => {
    expect(
      resolvesExactlyTo({ type: "css", value: ".row" }, [], document)
    ).toBe(false);
  });
});

describe("ElementRegistry", () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
    setBody(`
      <div id="a"></div>
      <div id="b"></div>
    `);
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("idFor / elFor", () => {
    it("assigns ids monotonically (el-1, el-2, …)", () => {
      const a = document.getElementById("a")!;
      const b = document.getElementById("b")!;
      expect(registry.idFor(a)).toBe("el-1");
      expect(registry.idFor(b)).toBe("el-2");
    });

    it("returns the same id for the same element on repeat lookups", () => {
      const a = document.getElementById("a")!;
      const first = registry.idFor(a);
      const second = registry.idFor(a);
      expect(second).toBe(first);
    });

    it("round-trips element ↔ id via elFor", () => {
      const a = document.getElementById("a")!;
      const id = registry.idFor(a);
      expect(registry.elFor(id)).toBe(a);
    });

    it("elFor returns undefined for an unknown id", () => {
      expect(registry.elFor("el-999")).toBeUndefined();
    });
  });

  describe("idsForSelector", () => {
    it("returns the ids assigned to the matched elements", () => {
      setBody(`
        <span class="x" id="x1"></span>
        <span class="x" id="x2"></span>
      `);
      const ids = registry.idsForSelector(
        { type: "css", value: ".x" },
        document
      );
      // Two new elements get el-1 and el-2 in document order.
      expect(ids).toEqual(["el-1", "el-2"]);
      expect(registry.elFor("el-1")).toBe(document.getElementById("x1"));
    });
  });

  describe("htmlFor", () => {
    it("returns the outerHTML of the registered element", () => {
      const a = document.getElementById("a")!;
      const id = registry.idFor(a);
      expect(registry.htmlFor(id)).toBe('<div id="a"></div>');
    });

    it("truncates long outerHTML at maxChars with a trailing marker", () => {
      const div = document.createElement("div");
      div.setAttribute("data-big", "z".repeat(2000));
      document.body.appendChild(div);
      const id = registry.idFor(div);

      const html = registry.htmlFor(id, 100);

      expect(html.length).toBe(100 + " …".length);
      expect(html.endsWith(" …")).toBe(true);
    });

    it("returns the id itself when the element isn't in the registry (safety fallback)", () => {
      expect(registry.htmlFor("el-unknown")).toBe("el-unknown");
    });
  });

  describe("release", () => {
    it("drops the id → element map and resets the counter", () => {
      const a = document.getElementById("a")!;
      registry.idFor(a);
      registry.release();
      expect(registry.elFor("el-1")).toBeUndefined();
      // Next id starts at el-1 again.
      expect(registry.idFor(a)).toBe("el-1");
    });
  });
});
