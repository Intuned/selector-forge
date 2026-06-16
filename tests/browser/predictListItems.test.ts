import { afterEach, describe, expect, it } from "vitest";
import { predictListMatches } from "../../lib/content/dom/predictListItems";
import { computeXPath } from "../../lib/content/dom/xpath";

/**
 * DOM-resolution layer of list-mode prediction — exercised in the browser
 * project because document.evaluate is unavailable in happy-dom. The pure
 * xpath logic lives in tests/unit/dom/predictListItems.test.ts.
 */

describe("predictListMatches (live DOM)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves every item in the array from two picks", () => {
    document.body.innerHTML = `
      <main><ul>
        <li><span>1</span></li>
        <li><span>2</span></li>
        <li><span>3</span></li>
        <li><span>4</span></li>
      </ul></main>`;
    const items = [...document.querySelectorAll("li")];
    const picks = [computeXPath(items[0])!, computeXPath(items[2])!];

    expect(predictListMatches(picks)).toEqual(items);
  });

  it("returns nothing when the picks aren't a predictable array", () => {
    document.body.innerHTML = `
      <header>title</header>
      <main><p>body</p></main>`;
    const a = document.querySelector("header")!;
    const b = document.querySelector("p")!;
    const picks = [computeXPath(a)!, computeXPath(b)!];

    expect(predictListMatches(picks)).toEqual([]);
  });
});
