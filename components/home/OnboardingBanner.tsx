"use client";

import Link from "next/link";
import { UserPlus, ImagePlus, Sparkles } from "lucide-react";
import Card from "../ui/Card";

type Props = {
  hasProspects: boolean;
  hasActivity: boolean;
  isPro: boolean;
  draftsEverGenerated: number;
};

export default function OnboardingBanner({
  hasProspects,
  hasActivity,
  isPro,
  draftsEverGenerated,
}: Props) {
  if (!hasProspects) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <UserPlus size={20} strokeWidth={1.25} className="mt-0.5 shrink-0 text-[var(--rm-accent)]" />
          <div>
            <p className="text-sm font-medium text-[var(--rm-text)]">Add someone to your roster</p>
            <p className="mt-1 text-sm text-[var(--rm-text-muted)]">
              Go to <strong className="text-[var(--rm-text)]">People</strong>, add a name, and pick their tier.
            </p>
            <Link
              href="/roster"
              className="mt-3 inline-flex items-center rounded-full bg-[var(--rm-accent)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110"
            >
              Add person
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  if (!hasActivity) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <ImagePlus size={20} strokeWidth={1.25} className="mt-0.5 shrink-0 text-[var(--rm-accent)]" />
          <div>
            <p className="text-sm font-medium text-[var(--rm-text)]">Log your first message</p>
            <p className="mt-1 text-sm text-[var(--rm-text-muted)]">
              Open <strong className="text-[var(--rm-text)]">Texts</strong> and screenshot or type something. The AI needs real data.
            </p>
            <Link
              href="/inbox"
              className="mt-3 inline-flex items-center rounded-full bg-[var(--rm-accent)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110"
            >
              Open Texts
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  if (!isPro && draftsEverGenerated === 0) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <Sparkles size={20} strokeWidth={1.25} className="mt-0.5 shrink-0 text-emerald-400" />
          <div>
            <p className="text-sm font-medium text-[var(--rm-text)]">Try an AI draft (free)</p>
            <p className="mt-1 text-sm text-[var(--rm-text-muted)]">
              Tap <strong className="text-[var(--rm-text)]">Generate</strong> on any card below.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return null;
}
