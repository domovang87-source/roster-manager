import { describe, expect, it } from "vitest";
import {
  charismaAdjustFromVibeNotes,
  inboundRepairAndAffectionScore,
  outboundConflictIntensity,
  repairBonusForScore,
} from "./charisma-context-signals";

describe("charismaAdjustFromVibeNotes", () => {
  it("returns zeros for empty / null / whitespace", () => {
    expect(charismaAdjustFromVibeNotes(undefined)).toEqual({
      imbalanceRelief: 0,
      openLoopRelief: 0,
      cadenceRelief: 0,
    });
    expect(charismaAdjustFromVibeNotes(null)).toEqual({
      imbalanceRelief: 0,
      openLoopRelief: 0,
      cadenceRelief: 0,
    });
    expect(charismaAdjustFromVibeNotes("   \n")).toEqual({
      imbalanceRelief: 0,
      openLoopRelief: 0,
      cadenceRelief: 0,
    });
  });

  it("detects platonic / friend intent", () => {
    const v = charismaAdjustFromVibeNotes("Steve is just a friend, not romantic");
    expect(v.imbalanceRelief).toBeGreaterThanOrEqual(0.4);
    expect(v.openLoopRelief).toBeGreaterThanOrEqual(0.2);
    expect(v.cadenceRelief).toBe(0);
  });

  it("detects work / product context", () => {
    const v = charismaAdjustFromVibeNotes("Coworker — ok if I ask him about my AI product demo");
    expect(v.imbalanceRelief).toBeGreaterThan(0.5);
    expect(v.openLoopRelief).toBeGreaterThan(0.15);
  });

  it("detects low stakes / casual", () => {
    const v = charismaAdjustFromVibeNotes("Low stakes, casual chat");
    expect(v.cadenceRelief).toBeGreaterThan(0);
    expect(v.imbalanceRelief).toBeGreaterThan(0);
  });

  it("detects pick your brain phrasing", () => {
    const v = charismaAdjustFromVibeNotes("Networking contact, pick your brain on fundraising");
    expect(v.imbalanceRelief).toBeGreaterThan(0.3);
  });

  it("caps relief so notes cannot zero out all penalties", () => {
    const v = charismaAdjustFromVibeNotes(
      "Just friends platonic coworker networking mentor demo beta startup pitch low stakes casual pick your brain"
    );
    expect(v.imbalanceRelief).toBeLessThanOrEqual(0.78);
    expect(v.openLoopRelief).toBeLessThanOrEqual(0.55);
    expect(v.cadenceRelief).toBeLessThanOrEqual(0.4);
  });

  it("is case-insensitive", () => {
    const a = charismaAdjustFromVibeNotes("PLATONIC work friend");
    const b = charismaAdjustFromVibeNotes("platonic WORK FRIEND");
    expect(a.imbalanceRelief).toBe(b.imbalanceRelief);
  });

  it("matches realistic long prospect note (friend + product)", () => {
    const v = charismaAdjustFromVibeNotes(
      "Steve is just a friend — it's more ok if I ask him a lot of questions about my AI product"
    );
    expect(v.imbalanceRelief).toBeGreaterThanOrEqual(0.5);
    expect(v.openLoopRelief).toBeGreaterThan(0.15);
  });
});

describe("inboundRepairAndAffectionScore", () => {
  it("returns 0 for empty list", () => {
    expect(inboundRepairAndAffectionScore([])).toBe(0);
  });

  it("scores apology language", () => {
    expect(inboundRepairAndAffectionScore(["I'm so sorry, that was my fault"])).toBeGreaterThanOrEqual(38);
  });

  it("scores affection + repair together", () => {
    const s = inboundRepairAndAffectionScore([
      "Baby I'm sorry please forgive me",
      "I love you more than anything",
      "I promise to make it right",
    ]);
    expect(s).toBe(100);
  });

  it("caps at 100", () => {
    const s = inboundRepairAndAffectionScore([
      "sorry apologize forgive love you miss you promise make it right please understand don't be mad",
    ]);
    expect(s).toBe(100);
  });
});

describe("outboundConflictIntensity", () => {
  it("returns 0 for empty", () => {
    expect(outboundConflictIntensity([])).toBe(0);
  });

  it("detects strong conflict", () => {
    expect(outboundConflictIntensity(["I hate you", "go away"])).toBeGreaterThanOrEqual(55);
  });

  it("detects anger without slurs", () => {
    const s = outboundConflictIntensity(["I'm so mad at you", "how could you do this"]);
    expect(s).toBeGreaterThanOrEqual(38);
  });

  it("only uses first 6 bodies", () => {
    const calm = Array.from({ length: 10 }, () => "ok thanks");
    calm[0] = "I'm furious at you";
    expect(outboundConflictIntensity(calm)).toBeGreaterThanOrEqual(38);
  });
});

describe("repairBonusForScore", () => {
  it("no bonus if not their last message", () => {
    expect(repairBonusForScore("outbound", 80, 0)).toBe(0);
    expect(repairBonusForScore(undefined, 80, 0)).toBe(0);
  });

  it("no bonus below repair threshold", () => {
    expect(repairBonusForScore("inbound", 20, 0)).toBe(0);
  });

  it("applies full bonus when inbound last and high repair, low conflict", () => {
    expect(repairBonusForScore("inbound", 70, 0)).toBe(10);
    expect(repairBonusForScore("inbound", 49, 0)).toBe(7);
  });

  it("dampens bonus when outbound conflict was high", () => {
    const low = repairBonusForScore("inbound", 70, 10);
    const mid = repairBonusForScore("inbound", 70, 25);
    const high = repairBonusForScore("inbound", 70, 50);
    expect(low).toBeGreaterThanOrEqual(mid);
    expect(mid).toBeGreaterThanOrEqual(high);
    expect(high).toBeLessThan(mid);
  });
});
