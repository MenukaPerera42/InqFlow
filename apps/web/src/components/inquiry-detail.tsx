'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import { api, ApiError, type InquiryStatus, queryKeys } from '@/lib/api';
import { formatDate, statusLabel } from '@/lib/presentation';
import { StatusBadge } from './status-badge';
import { LoadingState } from './loading-state';

const nextAction: Record<
  InquiryStatus,
  { status: InquiryStatus; label: string } | null
> = {
  NEW: { status: 'IN_PROGRESS', label: 'Start progress' },
  IN_PROGRESS: { status: 'RESOLVED', label: 'Mark resolved' },
  RESOLVED: null,
};

export function InquiryDetail() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const inquiry = useQuery({
    queryKey: queryKeys.inquiry(id),
    queryFn: ({ signal }) => api.inquiry(id, signal),
  });
  const update = useMutation({
    mutationFn: ({
      status,
      version,
    }: {
      status: InquiryStatus;
      version: number;
    }) => api.updateStatus(id, status, version),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.inquiry(id), result);
      void queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      setConflict(false);
      setNotice(`Status updated to ${statusLabel[result.data.status]}.`);
    },
    onError: (error) => {
      setNotice('');
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT')
        setConflict(true);
    },
  });
  if (inquiry.isPending)
    return (
      <main className="mx-auto max-w-4xl">
        <LoadingState label="Loading inquiry…" />
      </main>
    );
  if (inquiry.error instanceof ApiError && inquiry.error.status === 404)
    return (
      <main className="mx-auto max-w-4xl py-14 text-center">
        <h1 className="text-3xl font-semibold">Inquiry not found</h1>
        <p className="muted mt-3">
          It may have been removed, or you may not have access.
        </p>
        <Link href="/dashboard" className="btn btn-primary mt-7">
          Back to inquiries
        </Link>
      </main>
    );
  if (inquiry.isError)
    return (
      <main className="mx-auto max-w-4xl">
        <div className="panel p-8">
          <h1 className="text-xl font-semibold">Could not load this inquiry</h1>
          <p className="muted mt-2">Check your connection and try again.</p>
          <button
            type="button"
            className="btn btn-secondary mt-5"
            onClick={() => void inquiry.refetch()}
          >
            Retry
          </button>
        </div>
      </main>
    );
  const item = inquiry.data.data;
  const action = nextAction[item.status];
  const errorMessage =
    update.error instanceof ApiError
      ? update.error.code === 'VERSION_CONFLICT'
        ? 'This inquiry was updated elsewhere. Refresh to see the latest information.'
        : update.error.code === 'INVALID_STATUS_TRANSITION'
          ? 'That status change is no longer available. Refresh the inquiry.'
          : update.error.message
      : update.error
        ? 'Could not update the status. Please try again.'
        : '';
  const refresh = async () => {
    setConflict(false);
    setNotice('');
    update.reset();
    await inquiry.refetch();
  };
  return (
    <main className="mx-auto max-w-4xl">
      <Link
        href="/dashboard"
        className="muted inline-flex items-center gap-2 text-sm font-medium hover:text-[var(--ink)]"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Back to inquiries
      </Link>
      {searchParams.get('created') === '1' && (
        <p role="status" className="notice notice-success mt-6">
          Inquiry saved successfully.
        </p>
      )}
      <div className="mb-8 mt-8 flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-[var(--coral)]">
            Inquiry details
          </p>
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {item.subject}
          </h1>
          <p className="muted mt-3 text-sm">
            Created {formatDate(item.createdAt)} · Updated{' '}
            {formatDate(item.updatedAt)}
          </p>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <div className="grid gap-5 md:grid-cols-[1.6fr_1fr]">
        <section
          className="panel p-6 sm:p-8"
          aria-labelledby="description-title"
        >
          <h2 id="description-title" className="text-lg font-semibold">
            Description
          </h2>
          <p className="mt-5 whitespace-pre-wrap leading-7 text-[var(--ink)]">
            {item.description}
          </p>
        </section>
        <aside className="panel p-6 sm:p-8" aria-label="Customer and status">
          <h2 className="text-lg font-semibold">Customer</h2>
          <dl className="mt-5 space-y-5 text-sm">
            <div>
              <dt className="muted mb-1">Name</dt>
              <dd className="font-medium">{item.customerName}</dd>
            </div>
            <div>
              <dt className="muted mb-1">Contact</dt>
              <dd className="break-words font-medium">
                {item.customerContact}
              </dd>
            </div>
          </dl>
          <div className="my-7 border-t border-[var(--border)]" />
          <h2 className="text-lg font-semibold">Next step</h2>
          {action ? (
            <p className="muted mt-2 text-sm">
              Move this inquiry to {statusLabel[action.status].toLowerCase()}{' '}
              when ready.
            </p>
          ) : (
            <p className="muted mt-2 text-sm">
              This inquiry is resolved. No further status changes are available.
            </p>
          )}
          {notice && (
            <p role="status" className="notice notice-success mt-5">
              {notice}
            </p>
          )}
          {errorMessage && (
            <p role="alert" className="notice notice-error mt-5">
              {errorMessage}
            </p>
          )}
          {conflict && (
            <button
              type="button"
              className="btn btn-secondary mt-5 w-full"
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} aria-hidden="true" /> Refresh inquiry
            </button>
          )}
          {!conflict && action && (
            <button
              type="button"
              className="btn btn-primary mt-5 w-full"
              disabled={update.isPending}
              onClick={() => {
                setNotice('');
                update.mutate({ status: action.status, version: item.version });
              }}
            >
              {update.isPending ? 'Updating…' : action.label}
              {!update.isPending && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          )}
        </aside>
      </div>
    </main>
  );
}
