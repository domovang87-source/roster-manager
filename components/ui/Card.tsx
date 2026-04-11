import React from "react";

type Props = {
  children: React.ReactNode;
  /** Optional header rendered above the body with a bottom border */
  header?: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  onClick?: () => void;
};

export default function Card({
  children,
  header,
  className = "",
  as: Tag = "div",
  onClick,
}: Props) {
  return (
    <Tag
      className={`rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] ${onClick ? "cursor-pointer transition hover:border-[var(--rm-text-muted)]/50" : ""} ${className}`}
      onClick={onClick}
    >
      {header && (
        <div className="border-b border-[var(--rm-border)] px-4 py-3">
          {header}
        </div>
      )}
      <div className="px-4 py-4">{children}</div>
    </Tag>
  );
}
