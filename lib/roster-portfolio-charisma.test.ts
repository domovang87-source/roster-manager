import { describe, expect, it } from "vitest";
import { theirEngagementCreditFromNoteBody } from "./note-engagement-signal";
import { collectRecentTextBodiesForProspect, type MessageRowLike } from "./roster-portfolio-compute";

describe("theirEngagementCreditFromNoteBody (charisma-relevant)", () => {
  it("credits long voice memo phrasing", () => {
    expect(theirEngagementCreditFromNoteBody("Theo sent me a 10 minute voice memo helping me think through it")).toBeGreaterThanOrEqual(4);
  });

  it("credits helped me / advice language", () => {
    expect(theirEngagementCreditFromNoteBody("She really listened — great advice on the job stuff")).toBeGreaterThanOrEqual(3);
  });

  it("returns 0 for empty or trivial note", () => {
    expect(theirEngagementCreditFromNoteBody("")).toBe(0);
    expect(theirEngagementCreditFromNoteBody("ok")).toBe(0);
  });
});

describe("collectRecentTextBodiesForProspect", () => {
  const pid = "p1";
  const baseTime = new Date("2026-03-28T12:00:00.000Z").getTime();

  function row(
    offsetMin: number,
    direction: "inbound" | "outbound",
    body: string,
    event_type?: string | null
  ): MessageRowLike {
    return {
      prospect_id: pid,
      created_at: new Date(baseTime + offsetMin * 60_000).toISOString(),
      direction,
      body,
      event_type: event_type ?? null,
    };
  }

  it("returns newest-first inbound and outbound separately (higher offsetMin = newer)", () => {
    const rows: MessageRowLike[] = [
      row(0, "inbound", "oldest in"),
      row(1, "inbound", "mid in"),
      row(2, "inbound", "newest in"),
      row(1, "outbound", "older out"),
      row(2, "outbound", "newest out"),
    ];
    const { inbound, outbound } = collectRecentTextBodiesForProspect(rows, pid, 5);
    expect(inbound).toEqual(["newest in", "mid in", "oldest in"]);
    expect(outbound).toEqual(["newest out", "older out"]);
  });

  it("skips reactions and outbound notes", () => {
    const rows: MessageRowLike[] = [
      row(0, "inbound", "real"),
      row(1, "inbound", "liked an image"),
      row(2, "outbound", "note body", "note"),
      row(3, "outbound", "real out"),
    ];
    const { inbound, outbound } = collectRecentTextBodiesForProspect(rows, pid, 5);
    expect(inbound).toEqual(["real"]);
    expect(outbound).toEqual(["real out"]);
  });

  it("respects limit", () => {
    const rows: MessageRowLike[] = Array.from({ length: 8 }, (_, i) =>
      row(i, "inbound", `m${i}`)
    ).reverse();
    const { inbound } = collectRecentTextBodiesForProspect(rows, pid, 3);
    expect(inbound.length).toBe(3);
  });

  it("ignores other prospects", () => {
    const rows: MessageRowLike[] = [
      { ...row(0, "inbound", "mine"), prospect_id: pid },
      { ...row(1, "inbound", "theirs"), prospect_id: "other" },
    ];
    const { inbound } = collectRecentTextBodiesForProspect(rows, pid, 5);
    expect(inbound).toEqual(["mine"]);
  });
});
