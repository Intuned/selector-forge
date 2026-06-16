import { describe, expect, it } from "vitest";
import {
  generalizeArrayXpath,
  partOfSameArrayXpath,
  verifyThatAllXpathsArePartOfSameArray,
} from "../../../lib/content/dom/predictListItems";

/**
 * Pure xpath logic behind list-mode prediction. The DOM-resolution layer
 * (predictListMatches) is covered in the browser project, where
 * document.evaluate is available.
 */

describe("partOfSameArrayXpath", () => {
  it("is true for siblings differing by one sibling index", () => {
    expect(partOfSameArrayXpath("/a/ul/li[1]/x", "/a/ul/li[2]/x")).toBe(true);
  });

  it("is false for identical paths", () => {
    expect(partOfSameArrayXpath("/a/ul/li[1]", "/a/ul/li[1]")).toBe(false);
  });

  it("is false for different structure (length mismatch)", () => {
    expect(partOfSameArrayXpath("/a/ul/li[1]", "/a/ul/li[1]/x")).toBe(false);
  });

  it("is false for a non-numeric (structural) difference", () => {
    expect(partOfSameArrayXpath("/a/ul/li[1]", "/a/ul/div[1]")).toBe(false);
  });

  it("is false when two segments differ numerically", () => {
    expect(partOfSameArrayXpath("/a/b[1]/c[1]", "/a/b[2]/c[2]")).toBe(false);
  });
});

describe("verifyThatAllXpathsArePartOfSameArray", () => {
  it("is true when every path shares one array with the first", () => {
    expect(
      verifyThatAllXpathsArePartOfSameArray([
        "/a/ul/li[1]/x",
        "/a/ul/li[2]/x",
        "/a/ul/li[5]/x",
      ])
    ).toBe(true);
  });

  it("is false with fewer than two paths", () => {
    expect(verifyThatAllXpathsArePartOfSameArray(["/a/ul/li[1]"])).toBe(false);
  });

  it("is false when one path breaks the array", () => {
    expect(
      verifyThatAllXpathsArePartOfSameArray([
        "/a/ul/li[1]/x",
        "/a/ul/li[2]/x",
        "/a/ol/li[1]/x",
      ])
    ).toBe(false);
  });
});

describe("generalizeArrayXpath", () => {
  it("strips the varying sibling index to match the whole array", () => {
    expect(generalizeArrayXpath(["/a/ul/li[1]/x", "/a/ul/li[3]/x"])).toBe(
      "/a/ul/li/x"
    );
  });

  it("returns null for picks that don't form an array", () => {
    expect(generalizeArrayXpath(["/a/ul/li[1]", "/a/ol/li[2]"])).toBeNull();
  });

  it("returns null for a single pick", () => {
    expect(generalizeArrayXpath(["/a/ul/li[1]"])).toBeNull();
  });
});
