"use client";

import React from "react";
import Sheet from "../ui/Sheet";
import type { MomentumContext } from "../../lib/momentum-insight";
import { momentumPopoverLines } from "../../lib/momentum-insight";

type Props = {
  open: boolean;
  onClose: () => void;
  name: string;
  score: number;
  tier: string;
  context: MomentumContext | undefined;
};

export default function ScoreSheet({ open, onClose, name, score, tier, context }: Props) {
  const lines = React.useMemo(
    () => momentumPopoverLines(name, score, context),
    [name, score, context]
  );

  return (
    <Sheet open={open} onClose={onClose} title={`${name} · ${score}/100`} position="bottom">
      <p className="label text-[var(--rm-text-muted)]">Thread score · {tier}</p>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--rm-text-muted)]">
        {lines.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
    </Sheet>
  );
}
