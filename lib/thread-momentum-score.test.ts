import { describe, expect, it } from "vitest";
import { computeThreadMomentum100, tapbackChaseMetrics } from "./thread-momentum-score";

const NOW = new Date("2026-03-28T15:00:00.000Z");

function daysAgo(n: number): string {
  const d = new Date(NOW.getTime() - n * 86_400_000);
  return d.toISOString();
}

describe("tapbackChaseMetrics", () => {
  it("is inactive when latest is not outbound", () => {
    const m = tapbackChaseMetrics(
      { inboundReactionCount: 2, outboundRunSinceTheirText: 3, tapbacksDuringYourStreak: 2 },
      "inbound",
      0,
      4
    );
    expect(m.chase).toBe(false);
  });

  it("detects chase when reacts + outbound run", () => {
    const m = tapbackChaseMetrics(
      { inboundReactionCount: 1, outboundRunSinceTheirText: 2, tapbacksDuringYourStreak: 1 },
      "outbound",
      0,
      2
    );
    expect(m.chase).toBe(true);
  });
});

describe("computeThreadMomentum100", () => {
  it("returns 0 when no logged activity", () => {
    expect(
      computeThreadMomentum100("B", 0, 0, 0, 0, 0, 0, undefined, 7, NOW, undefined, undefined, undefined)
    ).toBe(0);
  });

  it("open-loop: you texted last, 2d wait, 2 sends since their line — not near 100 without context", () => {
    const trail = { inboundReactionCount: 0, outboundRunSinceTheirText: 2, tapbacksDuringYourStreak: 0 };
    const score = computeThreadMomentum100(
      "B",
      12,
      3,
      0,
      9,
      0,
      0,
      daysAgo(2),
      7,
      NOW,
      "outbound",
      "hey",
      trail
    );
    expect(score).toBeLessThanOrEqual(72);
    expect(score).toBeGreaterThanOrEqual(45);
  });

  it("open-loop is softer when vibe notes say friend / product context", () => {
    const trail = { inboundReactionCount: 0, outboundRunSinceTheirText: 2, tapbacksDuringYourStreak: 0 };
    const base = computeThreadMomentum100(
      "B",
      12,
      3,
      0,
      9,
      0,
      0,
      daysAgo(2),
      7,
      NOW,
      "outbound",
      "hey",
      trail
    );
    const withVibe = computeThreadMomentum100(
      "B",
      12,
      3,
      0,
      9,
      0,
      0,
      daysAgo(2),
      7,
      NOW,
      "outbound",
      "hey",
      trail,
      { vibeNotes: "Just a friend — coworker, fine if I ask about my AI product" }
    );
    expect(withVibe).toBeGreaterThan(base);
  });

  it("repair bonus when they texted last and recent inbound shows apology + affection", () => {
    const trail = { inboundReactionCount: 0, outboundRunSinceTheirText: 0, tapbacksDuringYourStreak: 0 };
    const repairBodies = [
      "I'm so sorry babe",
      "I love you so much please forgive me",
      "I promise I'll make it right",
    ];
    const without = computeThreadMomentum100(
      "A",
      20,
      8,
      0,
      6,
      0,
      0,
      daysAgo(1),
      5,
      NOW,
      "inbound",
      repairBodies[0],
      trail
    );
    const withCtx = computeThreadMomentum100(
      "A",
      20,
      8,
      0,
      6,
      0,
      0,
      daysAgo(1),
      5,
      NOW,
      "inbound",
      repairBodies[0],
      trail,
      { recentInboundTextBodies: repairBodies, recentOutboundTextBodies: [] }
    );
    expect(withCtx).toBeGreaterThan(without);
    expect(withCtx - without).toBeGreaterThanOrEqual(8);
  });

  it("heavy overdue on cadence drives score down", () => {
    const trail = { inboundReactionCount: 0, outboundRunSinceTheirText: 0, tapbacksDuringYourStreak: 0 };
    const score = computeThreadMomentum100(
      "A",
      15,
      6,
      0,
      6,
      0,
      0,
      daysAgo(40),
      5,
      NOW,
      "inbound",
      "you there?",
      trail
    );
    expect(score).toBeLessThanOrEqual(35);
  });

  it("tapback chase caps score even with otherwise high components", () => {
    const trail = { inboundReactionCount: 2, outboundRunSinceTheirText: 3, tapbacksDuringYourStreak: 2 };
    const score = computeThreadMomentum100(
      "B",
      14,
      0,
      0,
      5,
      0,
      0,
      daysAgo(0),
      14,
      NOW,
      "outbound",
      undefined,
      trail
    );
    expect(score).toBeLessThanOrEqual(76);
  });

  it("context object with no fields behaves like undefined", () => {
    const trail = { inboundReactionCount: 0, outboundRunSinceTheirText: 1, tapbacksDuringYourStreak: 0 };
    const a = computeThreadMomentum100(
      "C",
      8,
      4,
      0,
      4,
      1,
      0,
      daysAgo(1),
      10,
      NOW,
      "outbound",
      "hi",
      trail
    );
    const b = computeThreadMomentum100(
      "C",
      8,
      4,
      0,
      4,
      1,
      0,
      daysAgo(1),
      10,
      NOW,
      "outbound",
      "hi",
      trail,
      {}
    );
    expect(a).toBe(b);
  });

  it("clamps to 0–100", () => {
    const trail = { inboundReactionCount: 0, outboundRunSinceTheirText: 0, tapbacksDuringYourStreak: 0 };
    const low = computeThreadMomentum100(
      "A",
      8,
      1,
      0,
      1,
      0,
      0,
      daysAgo(200),
      3,
      NOW,
      "inbound",
      "k",
      trail
    );
    expect(low).toBeGreaterThanOrEqual(0);
    expect(low).toBeLessThanOrEqual(100);
  });

  it("vibe note relieves A-tier imbalance when you outbound much more than they do", () => {
    const trail = { inboundReactionCount: 0, outboundRunSinceTheirText: 1, tapbacksDuringYourStreak: 0 };
    const base = computeThreadMomentum100(
      "A",
      28,
      4,
      0,
      20,
      0,
      0,
      daysAgo(1),
      10,
      NOW,
      "outbound",
      "sounds good",
      trail
    );
    const withVibe = computeThreadMomentum100(
      "A",
      28,
      4,
      0,
      20,
      0,
      0,
      daysAgo(1),
      10,
      NOW,
      "outbound",
      "sounds good",
      trail,
      { vibeNotes: "Platonic friend — I pitch him on my startup a lot" }
    );
    expect(withVibe).toBeGreaterThan(base);
  });

  it("inboundNoteCredit improves ratio vs raw text counts alone (e.g. voice memo logged in note)", () => {
    const trail = { inboundReactionCount: 0, outboundRunSinceTheirText: 1, tapbacksDuringYourStreak: 0 };
    const noCredit = computeThreadMomentum100(
      "B",
      20,
      3,
      0,
      12,
      1,
      0,
      daysAgo(1),
      7,
      NOW,
      "outbound",
      "yo",
      trail
    );
    const withCredit = computeThreadMomentum100(
      "B",
      20,
      3,
      8,
      12,
      1,
      0,
      daysAgo(1),
      7,
      NOW,
      "outbound",
      "yo",
      trail
    );
    expect(withCredit).toBeGreaterThan(noCredit);
  });

  it("note + touch bonuses still apply when not in tapback chase", () => {
    const trail = { inboundReactionCount: 0, outboundRunSinceTheirText: 0, tapbacksDuringYourStreak: 0 };
    const plain = computeThreadMomentum100(
      "C",
      10,
      5,
      0,
      5,
      0,
      0,
      daysAgo(0),
      14,
      NOW,
      "inbound",
      "hey you",
      trail
    );
    const withNotes = computeThreadMomentum100(
      "C",
      10,
      5,
      0,
      5,
      2,
      1,
      daysAgo(0),
      14,
      NOW,
      "inbound",
      "hey you",
      trail
    );
    expect(withNotes).toBeGreaterThan(plain);
  });
});
