// node --test extension/test/icons.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));

test("manifest declares icons at 16, 32, 48 and 128 and the files exist", () => {
  for (const n of [16, 32, 48, 128]) {
    const path = manifest.icons[String(n)];
    assert.equal(path, `icons/icon-${n}.png`);
    assert.ok(existsSync(new URL(path, root)), `${path} is missing`);
  }
});

test("toolbar icon is set and its files exist", () => {
  for (const path of Object.values(manifest.action.default_icon)) {
    assert.ok(existsSync(new URL(path, root)), `${path} is missing`);
  }
});

test("PNG icons have the right pixel size", () => {
  for (const n of [16, 32, 48, 128]) {
    const buf = readFileSync(new URL(`icons/icon-${n}.png`, root));
    assert.equal(buf.readUInt32BE(16), n); // width in the IHDR chunk
    assert.equal(buf.readUInt32BE(20), n); // height
  }
});
