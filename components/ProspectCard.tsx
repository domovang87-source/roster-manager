type ProspectCardProps = {
  name: string;
  note?: string;
  actions?: React.ReactNode;
};

export default function ProspectCard({ name, note, actions }: ProspectCardProps) {
  return (
    <div className="relative w-full rounded-none border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] px-3 py-2 text-sm">
      {actions ? (
        <div className="absolute right-2 top-2">{actions}</div>
      ) : null}
      <div className="space-y-1 pr-6">
        <span className="font-semibold tracking-wide">{name}</span>
        {note ? (
          <p className="text-[11px] text-[var(--rm-text-muted)]">{note}</p>
        ) : null}
      </div>
    </div>
  );
}
