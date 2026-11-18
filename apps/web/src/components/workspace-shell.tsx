'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, LogOut, Plus } from 'lucide-react';
import { api, type StaffUser } from '@/lib/api';
import { BrandLogo } from './brand-logo';

export function WorkspaceShell({
  user,
  children,
}: {
  user: StaffUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [logoutError, setLogoutError] = useState('');
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.clear();
      router.replace('/login');
    },
    onError: () => setLogoutError('Could not sign out. Please try again.'),
  });
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="page-shell flex min-h-20 flex-wrap items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-8">
            <BrandLogo />
            <nav aria-label="Main navigation" className="hidden sm:block">
              <Link
                href="/dashboard"
                aria-current={pathname === '/dashboard' ? 'page' : undefined}
                className={`text-sm font-semibold ${pathname === '/dashboard' ? 'text-[var(--ink)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
              >
                Inquiries
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/inquiries/new" className="btn btn-primary">
              <Plus size={17} aria-hidden="true" />
              <span className="hidden sm:inline">New inquiry</span>
              <span className="sm:hidden">New</span>
            </Link>
            <span className="hidden border-l border-[var(--border)] pl-4 text-sm text-[var(--muted)] md:block">
              {user.name}
            </span>
            <button
              type="button"
              className="btn btn-quiet"
              aria-label="Sign out"
              title="Sign out"
              disabled={logout.isPending}
              onClick={() => {
                setLogoutError('');
                logout.mutate();
              }}
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      {logoutError && (
        <div className="page-shell pt-4">
          <p role="alert" className="notice notice-error">
            {logoutError}
          </p>
        </div>
      )}
      <div className="page-shell py-8 sm:py-12">{children}</div>
      <footer className="page-shell flex justify-between border-t border-[var(--border)] py-7 text-xs text-[var(--muted)]">
        <span>InqFlow · A clearer way to follow every inquiry.</span>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 hover:text-[var(--ink)]"
        >
          Back to inquiries <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
