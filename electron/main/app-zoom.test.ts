import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZOOM_MAX_FACTOR, ZOOM_MIN_FACTOR, clampZoomFactor, parseStoredZoomFactor, stepZoomFactor, zoomCommandFromInput, zoomPercent } from "./app-zoom.js";

describe("app zoom model", () => {
  it("clamps zoom to the supported range", () => {
    assert.equal(clampZoomFactor(0.1), ZOOM_MIN_FACTOR);
    assert.equal(clampZoomFactor(9), ZOOM_MAX_FACTOR);
    assert.equal(clampZoomFactor(Number.NaN), 1);
  });

  it("steps zoom in stable 10 percent increments", () => {
    assert.equal(stepZoomFactor(1, "in"), 1.1);
    assert.equal(stepZoomFactor(1, "out"), 0.9);
    assert.equal(stepZoomFactor(1.5, "in"), ZOOM_MAX_FACTOR);
    assert.equal(stepZoomFactor(0.7, "out"), ZOOM_MIN_FACTOR);
  });

  it("safely parses persisted zoom settings", () => {
    assert.equal(parseStoredZoomFactor({ zoomFactor: 1.2 }), 1.2);
    assert.equal(parseStoredZoomFactor({ zoomFactor: 12 }), ZOOM_MAX_FACTOR);
    assert.equal(parseStoredZoomFactor({ zoomFactor: "1.2" }), 1);
    assert.equal(parseStoredZoomFactor(null), 1);
  });

  it("recognizes supported zoom keyboard shortcuts", () => {
    assert.equal(zoomCommandFromInput({ control: true, type: "keyDown", key: "=" }), "in");
    assert.equal(zoomCommandFromInput({ control: true, type: "keyDown", key: "+" }), "in");
    assert.equal(zoomCommandFromInput({ control: true, type: "keyDown", key: "-" }), "out");
    assert.equal(zoomCommandFromInput({ control: true, type: "keyDown", key: "0" }), "reset");
    assert.equal(zoomCommandFromInput({ control: false, type: "keyDown", key: "=" }), null);
    assert.equal(zoomCommandFromInput({ control: true, type: "keyUp", key: "=" }), null);
  });

  it("reports a readable percent label", () => {
    assert.equal(zoomPercent(1), 100);
    assert.equal(zoomPercent(1.25), 125);
  });
});
