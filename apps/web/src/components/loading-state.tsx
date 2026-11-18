export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="panel animate-pulse p-8">
      <span className="sr-only">{label}</span>
      <div className="h-5 w-2/5 rounded bg-slate-100" />
      <div className="mt-6 h-3 w-full rounded bg-slate-100" />
      <div className="mt-4 h-3 w-4/5 rounded bg-slate-100" />
    </div>
  );
}
