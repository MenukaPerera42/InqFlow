'use client';

import { useEffect } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { api, ApiError, queryKeys } from '@/lib/api';
import { BrandLogo } from './brand-logo';

const schema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  const login = useMutation({
    mutationFn: api.login,
    onSuccess: (result) => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, result);
      router.replace('/dashboard');
    },
  });
  const me = queryClient.getQueryData<{ user: { id: string } }>(queryKeys.me);
  useEffect(() => {
    if (me) router.replace('/dashboard');
  }, [me, router]);
  const message =
    login.error instanceof ApiError
      ? login.error.status === 401
        ? 'Invalid email or password.'
        : login.error.status === 429
          ? 'Too many sign-in attempts. Please try again later.'
          : login.error.message
      : login.error
        ? 'Could not sign in. Please try again.'
        : '';
  return (
    <div>
      <div className="mb-10 text-center">
        <span className="inline-flex">
          <BrandLogo />
        </span>
        <p className="muted mt-5 text-sm">
          Customer inquiries, clearly in hand.
        </p>
      </div>
      <section className="panel p-7 sm:p-10" aria-labelledby="login-title">
        <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl bg-[#fff0ef] text-[var(--coral)]">
          <LockKeyhole size={22} aria-hidden="true" />
        </div>
        <h1
          id="login-title"
          className="text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Welcome back
        </h1>
        <p className="muted mt-2 text-sm">Sign in to manage your inquiries.</p>
        <form
          className="mt-8 space-y-5"
          noValidate
          onSubmit={form.handleSubmit((values) => login.mutate(values))}
        >
          <div>
            <label className="field-label" htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="field"
              placeholder="you@company.com"
              aria-invalid={!!form.formState.errors.email}
              aria-describedby={
                form.formState.errors.email ? 'email-error' : undefined
              }
              {...form.register('email')}
            />
            {form.formState.errors.email && (
              <p id="email-error" role="alert" className="field-error">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>
          <div>
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="field"
              placeholder="Enter your password"
              aria-invalid={!!form.formState.errors.password}
              aria-describedby={
                form.formState.errors.password ? 'password-error' : undefined
              }
              {...form.register('password')}
            />
            {form.formState.errors.password && (
              <p id="password-error" role="alert" className="field-error">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>
          {message && (
            <p role="alert" className="notice notice-error">
              {message}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary mt-2 w-full"
            disabled={login.isPending}
          >
            {login.isPending ? 'Signing in…' : 'Sign in'}
            {!login.isPending && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </form>
      </section>
      <p className="muted mt-7 text-center text-xs">
        A private workspace for your customer conversations.
      </p>
    </div>
  );
}
