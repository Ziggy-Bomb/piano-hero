import { describe, it, expect } from "vitest";
import { extractXml, costUsd } from "../src/import/transcribe";

const DOC = `<?xml version="1.0"?><score-partwise version="3.1"><part id="P1"/></score-partwise>`;

describe("extractXml", () => {
  it("passes through a bare document", () => {
    expect(extractXml(DOC)).toBe(DOC);
  });

  it("strips markdown fences and prose", () => {
    const wrapped = "Here is the transcription:\n```xml\n" + DOC + "\n```\nLet me know!";
    expect(extractXml(wrapped)).toBe(DOC);
  });

  it("accepts a document without an xml declaration", () => {
    const bare = DOC.replace(`<?xml version="1.0"?>`, "");
    expect(extractXml("noise " + bare)).toBe(bare);
  });

  it("rejects truncated output", () => {
    expect(extractXml(DOC.slice(0, DOC.length - 10))).toBeNull();
    expect(extractXml("no music at all")).toBeNull();
  });
});

describe("costUsd", () => {
  it("prices at $5/M input + $25/M output", () => {
    expect(costUsd(1_000_000, 0)).toBeCloseTo(5);
    expect(costUsd(0, 1_000_000)).toBeCloseTo(25);
    expect(costUsd(4000, 12000)).toBeCloseTo(0.02 + 0.3);
  });
});
