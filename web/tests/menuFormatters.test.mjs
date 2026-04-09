import test from "node:test";
import assert from "node:assert/strict";

import { formatStatusObject, getMenuCaption } from "../helpers/menuFormatters.js";

test("formatStatusObject returns an empty list for missing values", () => {
  assert.deepEqual(formatStatusObject(undefined), []);
  assert.deepEqual(formatStatusObject(null), []);
  assert.deepEqual(formatStatusObject("bad"), []);
});

test("getMenuCaption tolerates a missing item object", () => {
  assert.equal(getMenuCaption(null, undefined, {}), "");
});

test("getMenuCaption renders effect status and caption when present", () => {
  const caption = getMenuCaption(
    null,
    {
      caption: "Hatch a fresh egg and start over.",
      effectStatus: {
        health: 5,
        score: 0
      }
    },
    {}
  );

  assert.equal(caption, "+5 HEALTH\nHatch a fresh egg and start over.");
});
