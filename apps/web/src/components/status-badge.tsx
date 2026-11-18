import type { InquiryStatus } from '@/lib/api';
import { statusLabel } from '@/lib/presentation';

const colors: Record<InquiryStatus, string> = {
  NEW: 'bg-slate-100 text-slate-700 border-slate-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-800 border-amber-200',
  RESOLVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

export function StatusBadge({ status }: { status: InquiryStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${colors[status]}`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-current"
      />
      {statusLabel[status]}
    </span>
  );
}
