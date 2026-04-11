import React from "react";

type Props = {
  title: string;
  subtitle?: string;
  /** Rendered to the right of the title on desktop, below on mobile */
  action?: React.ReactNode;
  /** Small eyebrow label above the title */
  eyebrow?: string;
};

export default function PageHeader({ title, subtitle, action, eyebrow }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="label mb-1 text-[var(--rm-text-muted)]">{eyebrow}</p>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-[var(--rm-text)] sm:text-2xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--rm-text-muted)]">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
