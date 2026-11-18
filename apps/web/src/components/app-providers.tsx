'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { unauthorizedEvent } from '@/lib/api';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 15_000,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: false },
        },
      }),
  );
  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.clear();
      router.replace('/login');
    };
    window.addEventListener(unauthorizedEvent, onUnauthorized);
    return () => window.removeEventListener(unauthorizedEvent, onUnauthorized);
  }, [queryClient, router]);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
