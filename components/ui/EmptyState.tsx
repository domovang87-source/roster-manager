import React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
  icon?: LucideIcon;
  headline: string;
  body?: string;
  cta?: { label: string; href: string };
};

export default function EmptyState({ icon: Icon, headline, body, cta }: Props) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      {Icon && (
        <Icon
          size={32}
          strokeWidth={1}
          className="mb-4 text-[var(--rm-text-muted)]"
        />
      )}
      <p className="text-base font-medium text-[var(--rm-text)]">{headline}</p>
      {body && (
        <p className="mt-2 max-w-xs text-sm text-[var(--rm-text-muted)]">{body}</p>
      )}
      {cta && (
        <Link
          href={cta.href}
          className="mt-5 inline-flex items-center rounded-full bg-[var(--rm-accent)] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:brightness-110"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
