'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from 'lucide-react';
import { api, type InquiryStatus, queryKeys } from '@/lib/api';
import { formatDate } from '@/lib/presentation';
import { StatusBadge } from './status-badge';
import { LoadingState } from './loading-state';

export function Dashboard() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InquiryStatus | ''>('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  const filters = {
    page,
    pageSize: 10,
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
  };
  const inquiries = useQuery({
    queryKey: queryKeys.inquiries(filters),
    queryFn: ({ signal }) => api.inquiries(filters, signal),
  });
  const changeSearch = (value: string) => {
    setSearchInput(value.slice(0, 100));
    setPage(1);
  };
  const changeStatus = (value: string) => {
    setStatus(value as InquiryStatus | '');
    setPage(1);
  };

  return (
    <main>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-[var(--coral)]">
            Workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Your inquiries
          </h1>
          <p className="muted mt-3 max-w-xl text-sm sm:text-base">
            Keep every customer conversation moving forward.
          </p>
        </div>
        <Link
          href="/inquiries/new"
          className="btn btn-primary hidden sm:inline-flex"
        >
          <Plus size={17} aria-hidden="true" /> New inquiry
        </Link>
      </div>
      <section className="panel overflow-hidden" aria-label="Inquiry overview">
        <div className="flex flex-col gap-4 border-b border-[var(--border)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="relative w-full sm:max-w-sm">
            <Search
              size={18}
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
            <label htmlFor="inquiry-search" className="sr-only">
              Search inquiries
            </label>
            <input
              id="inquiry-search"
              className="field pl-10"
              type="search"
              value={searchInput}
              onChange={(event) => changeSearch(event.target.value)}
              placeholder="Search name or subject"
              maxLength={100}
            />
          </div>
          <div className="flex items-center gap-3">
            <label
              htmlFor="status-filter"
              className="whitespace-nowrap text-sm font-medium text-[var(--muted)]"
            >
              Status
            </label>
            <select
              id="status-filter"
              className="field min-w-40"
              value={status}
              onChange={(event) => changeStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="NEW">New</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>
        </div>
        {inquiries.isPending ? (
          <div className="p-5">
            <LoadingState label="Loading inquiries…" />
          </div>
        ) : inquiries.isError ? (
          <div className="p-8 text-center">
            <p role="alert" className="font-semibold">
              Could not load inquiries.
            </p>
            <p className="muted mt-2 text-sm">
              Check your connection and try again.
            </p>
            <button
              type="button"
              className="btn btn-secondary mt-5"
              onClick={() => void inquiries.refetch()}
            >
              Retry
            </button>
          </div>
        ) : inquiries.data.data.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff0ef] text-[var(--coral)]">
              <Search size={24} aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold">
              {search || status ? 'No matching inquiries' : 'No inquiries yet'}
            </h2>
            <p className="muted mx-auto mt-2 max-w-sm text-sm">
              {search || status
                ? 'Try another search or status.'
                : 'Create your first inquiry to start tracking the conversation.'}
            </p>
            {!(search || status) && (
              <Link href="/inquiries/new" className="btn btn-primary mt-6">
                <Plus size={17} aria-hidden="true" /> New inquiry
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[#fbfcfd] text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th scope="col" className="px-6 py-4">
                      Inquiry
                    </th>
                    <th scope="col" className="px-6 py-4">
                      Customer
                    </th>
                    <th scope="col" className="px-6 py-4">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-4">
                      Created
                    </th>
                    <th scope="col" className="px-6 py-4">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {inquiries.data.data.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-[var(--border)] last:border-b-0 hover:bg-[#fcfcfd]"
                    >
                      <td className="px-6 py-5 font-semibold">
                        <Link
                          href={`/inquiries/${item.id}`}
                          className="hover:text-[var(--coral)]"
                        >
                          {item.subject}
                        </Link>
                      </td>
                      <td className="px-6 py-5">{item.customerName}</td>
                      <td className="px-6 py-5">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-6 py-5 text-[var(--muted)]">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Link
                          href={`/inquiries/${item.id}`}
                          aria-label={`Open ${item.subject}`}
                          className="inline-flex rounded p-2 hover:bg-slate-100"
                        >
                          <ArrowRight size={17} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-[var(--border)] md:hidden">
              {inquiries.data.data.map((item) => (
                <article key={item.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">
                        <Link
                          href={`/inquiries/${item.id}`}
                          className="hover:text-[var(--coral)]"
                        >
                          {item.subject}
                        </Link>
                      </h2>
                      <p className="muted mt-1 text-sm">{item.customerName}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
                    <span>{formatDate(item.createdAt)}</span>
                    <Link
                      href={`/inquiries/${item.id}`}
                      className="inline-flex items-center gap-1 font-semibold text-[var(--coral)]"
                    >
                      Open <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {inquiries.data && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] px-5 py-4 text-sm sm:px-6">
            <p className="muted" aria-live="polite">
              {inquiries.data.pagination.total}{' '}
              {inquiries.data.pagination.total === 1 ? 'inquiry' : 'inquiries'}{' '}
              · Page {page} of{' '}
              {Math.max(1, inquiries.data.pagination.totalPages)}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} aria-hidden="true" /> Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page >= inquiries.data.pagination.totalPages}
                onClick={() => setPage((current) => current + 1)}
                aria-label="Next page"
              >
                Next <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
