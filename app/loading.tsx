export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--rm-bg)] text-[var(--rm-text)]">
      <p className="text-2xl font-semibold tracking-[0.35em]">STACK</p>
      <p className="text-xs uppercase tracking-[0.4em] text-[var(--rm-text-muted)]">
        Loading…
      </p>
    </div>
  );
}
