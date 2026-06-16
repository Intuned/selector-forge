// Given a set of selected target element xpaths, for list mode, it predicts the
// other sibling elements on the list that would be selected by a single
// reliable selector. The pure xpath-generalization lives in `arrayXpath` so the
// background can reuse it without this module's `document` dependency.

import { generalizeArrayXpath } from "./arrayXpath";

export {
  generalizeArrayXpath,
  partOfSameArrayXpath,
  verifyThatAllXpathsArePartOfSameArray,
} from "./arrayXpath";

/** Every element matched by an xpath, in document order; [] on a bad xpath. */
function resolveAllByXpath(xpath: string): Element[] {
  const out: Element[] = [];
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i);
      if (node instanceof Element) out.push(node);
    }
  } catch {
    /* malformed xpath — no prediction */
  }
  return out;
}

export function predictListMatches(pickedXpaths: string[]): Element[] {
  const xpath = generalizeArrayXpath(pickedXpaths);
  if (!xpath) return [];
  return resolveAllByXpath(xpath);
}
