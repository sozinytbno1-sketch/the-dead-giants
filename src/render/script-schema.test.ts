import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ScriptSchema } from "./script-schema.js";

const load = (name: string) =>
  JSON.parse(readFileSync(`tests/fixtures/${name}`, "utf8"));

describe("ScriptSchema", () => {
  it("accepts sample-doc-with-image.json", () => {
    expect(() => ScriptSchema.parse(load("sample-doc-with-image.json"))).not.toThrow();
  });

  it("accepts sample-doc-no-image.json", () => {
    expect(() => ScriptSchema.parse(load("sample-doc-no-image.json"))).not.toThrow();
  });

  it("rejects invalid-bad-enum.json (bad kenBurns enum)", () => {
    expect(() => ScriptSchema.parse(load("invalid-bad-enum.json"))).toThrow(/kenBurns|enum/i);
  });

  it("rejects invalid-too-few-scenes.json (below 15-scene minimum)", () => {
    expect(() => ScriptSchema.parse(load("invalid-too-few-scenes.json"))).toThrow(/scenes|15|Too small/i);
  });

  it("rejects invalid-line-too-long.json (headline > 60 chars)", () => {
    expect(() => ScriptSchema.parse(load("invalid-line-too-long.json"))).toThrow(/60/);
  });

  it("requires hook + outro present", () => {
    const data = load("sample-doc-with-image.json");
    data.scenes = data.scenes.filter((s: { type: string }) => s.type !== "outro");
    expect(() => ScriptSchema.parse(data)).toThrow(/outro/);
  });

  it("accepts a maximum-size script with 60 scenes", () => {
    const data = load("sample-doc-no-image.json");
    const filler = Array.from({ length: 60 - data.scenes.length }, (_, i) => ({
      id: `pad-${i}`,
      type: "body",
      voiceText: "Câu chuyện tiếp tục.",
      templateData: { template: "fact-card", label: "FACT", fact: `pad ${i}` },
    }));
    data.scenes = [data.scenes[0], ...filler, ...data.scenes.slice(1)];
    expect(data.scenes.length).toBe(60);
    expect(() => ScriptSchema.parse(data)).not.toThrow();
  });

  it("rejects 61 scenes (above max)", () => {
    const data = load("sample-doc-no-image.json");
    const filler = Array.from({ length: 61 - data.scenes.length }, (_, i) => ({
      id: `pad-${i}`,
      type: "body",
      voiceText: "x",
      templateData: { template: "fact-card", label: "L", fact: "f" },
    }));
    data.scenes = [data.scenes[0], ...filler, ...data.scenes.slice(1)];
    expect(() => ScriptSchema.parse(data)).toThrow(/60/);
  });

  describe("documentary template schemas", () => {
    const baseDoc = () => load("sample-doc-no-image.json");

    it("accepts timeline with 2-6 events", () => {
      const data = baseDoc();
      data.scenes[2].templateData = {
        template: "timeline",
        events: [
          { year: "2000", text: "A" },
          { year: "2010", text: "B" },
        ],
      };
      expect(() => ScriptSchema.parse(data)).not.toThrow();
    });

    it("rejects timeline with 1 event", () => {
      const data = baseDoc();
      data.scenes[2].templateData = {
        template: "timeline",
        events: [{ year: "2000", text: "A" }],
      };
      expect(() => ScriptSchema.parse(data)).toThrow();
    });

    it("rejects quote-card without author", () => {
      const data = baseDoc();
      data.scenes[2].templateData = { template: "quote-card", quote: "..." };
      expect(() => ScriptSchema.parse(data)).toThrow();
    });

    it("accepts chapter-title with chapterNumber 0-99", () => {
      const data = baseDoc();
      data.scenes[2].templateData = {
        template: "chapter-title",
        chapterNumber: 99,
        title: "Final",
      };
      expect(() => ScriptSchema.parse(data)).not.toThrow();
    });

    it("rejects chapter-title with chapterNumber > 99", () => {
      const data = baseDoc();
      data.scenes[2].templateData = {
        template: "chapter-title",
        chapterNumber: 100,
        title: "Too high",
      };
      expect(() => ScriptSchema.parse(data)).toThrow();
    });

    it("accepts brand-logo with all optional fields", () => {
      const data = baseDoc();
      data.scenes[2].templateData = {
        template: "brand-logo",
        brandName: "McDonald's",
        founded: "1940",
        country: "USA",
        bgSrc: "$source.image",
      };
      expect(() => ScriptSchema.parse(data)).not.toThrow();
    });

    it("accepts fact-card with label + fact", () => {
      const data = baseDoc();
      data.scenes[2].templateData = {
        template: "fact-card",
        label: "DID YOU KNOW?",
        fact: "Something surprising happened.",
      };
      expect(() => ScriptSchema.parse(data)).not.toThrow();
    });
  });
});
