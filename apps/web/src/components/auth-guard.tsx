'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, ApiError, queryKeys } from '@/lib/api';
import { LoadingState } from './loading-state';
import { WorkspaceShell } from './workspace-shell';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => api.me(signal),
    retry: false,
  });
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401)
      router.replace('/login');
  }, [me.error, router]);
  if (
    me.isPending ||
    (me.error instanceof ApiError && me.error.status === 401)
  ) {
    return (
      <main className="page-shell py-20">
        <LoadingState label="Checking your session…" />
      </main>
    );
  }
  if (me.isError) {
    return (
      <main className="page-shell py-20">
        <div className="panel mx-auto max-w-lg p-8">
          <h1 className="text-xl font-semibold">
            Could not load your workspace
          </h1>
          <p className="muted mt-2">Check your connection and try again.</p>
          <button
            type="button"
            className="btn btn-primary mt-6"
            onClick={() => void me.refetch()}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }
  return <WorkspaceShell user={me.data.user}>{children}</WorkspaceShell>;
}
