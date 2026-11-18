'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

const required = (maximum: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(maximum, `${label} must be ${maximum} characters or fewer.`);
const schema = z.object({
  customerName: required(120, 'Customer name'),
  customerContact: required(200, 'Contact information'),
  subject: required(160, 'Subject'),
  description: required(2000, 'Description'),
});
type Values = z.infer<typeof schema>;

export function NewInquiryForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: '',
      customerContact: '',
      subject: '',
      description: '',
    },
  });
  const create = useMutation({
    mutationFn: api.createInquiry,
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      router.push(`/inquiries/${data.id}?created=1`);
    },
  });
  const submit = (values: Values) => {
    if (!create.isPending) create.mutate(values);
  };
  const errorMessage =
    create.error instanceof ApiError
      ? create.error.code === 'NETWORK_ERROR'
        ? 'Connection lost. The inquiry may have been saved; check your list before trying again.'
        : create.error.message
      : create.error
        ? 'Could not save this inquiry. Please try again.'
        : '';
  return (
    <main className="mx-auto max-w-3xl">
      <Link
        href="/dashboard"
        className="muted inline-flex items-center gap-2 text-sm font-medium hover:text-[var(--ink)]"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Back to inquiries
      </Link>
      <div className="mb-8 mt-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-[var(--coral)]">
          Capture
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          New inquiry
        </h1>
        <p className="muted mt-3 text-sm sm:text-base">
          Record the essentials so the next step is always clear.
        </p>
      </div>
      <section className="panel p-6 sm:p-9" aria-label="New inquiry form">
        <form
          className="space-y-6"
          noValidate
          onSubmit={form.handleSubmit(submit)}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="customerName" className="field-label">
                Customer name{' '}
                <span aria-hidden="true" className="text-[var(--coral)]">
                  *
                </span>
              </label>
              <input
                id="customerName"
                className="field"
                maxLength={120}
                placeholder="Alex Fernando"
                aria-invalid={!!form.formState.errors.customerName}
                aria-describedby={
                  form.formState.errors.customerName
                    ? 'customerName-error'
                    : undefined
                }
                {...form.register('customerName')}
              />
              {form.formState.errors.customerName && (
                <p id="customerName-error" role="alert" className="field-error">
                  {form.formState.errors.customerName.message}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="customerContact" className="field-label">
                Contact information{' '}
                <span aria-hidden="true" className="text-[var(--coral)]">
                  *
                </span>
              </label>
              <input
                id="customerContact"
                className="field"
                maxLength={200}
                placeholder="Email or phone number"
                aria-invalid={!!form.formState.errors.customerContact}
                aria-describedby={
                  form.formState.errors.customerContact
                    ? 'customerContact-error'
                    : undefined
                }
                {...form.register('customerContact')}
              />
              {form.formState.errors.customerContact && (
                <p
                  id="customerContact-error"
                  role="alert"
                  className="field-error"
                >
                  {form.formState.errors.customerContact.message}
                </p>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="subject" className="field-label">
              Subject{' '}
              <span aria-hidden="true" className="text-[var(--coral)]">
                *
              </span>
            </label>
            <input
              id="subject"
              className="field"
              maxLength={160}
              placeholder="What does the customer need?"
              aria-invalid={!!form.formState.errors.subject}
              aria-describedby={
                form.formState.errors.subject ? 'subject-error' : undefined
              }
              {...form.register('subject')}
            />
            {form.formState.errors.subject && (
              <p id="subject-error" role="alert" className="field-error">
                {form.formState.errors.subject.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="description" className="field-label">
              Description{' '}
              <span aria-hidden="true" className="text-[var(--coral)]">
                *
              </span>
            </label>
            <textarea
              id="description"
              rows={6}
              className="field resize-y"
              maxLength={2000}
              placeholder="Add a short, clear description of the inquiry."
              aria-invalid={!!form.formState.errors.description}
              aria-describedby={
                form.formState.errors.description
                  ? 'description-error'
                  : undefined
              }
              {...form.register('description')}
            />
            {form.formState.errors.description && (
              <p id="description-error" role="alert" className="field-error">
                {form.formState.errors.description.message}
              </p>
            )}
          </div>
          {errorMessage && (
            <p role="alert" className="notice notice-error">
              {errorMessage}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
            <p className="muted text-xs">Fields marked * are required.</p>
            <div className="flex gap-3">
              <Link href="/dashboard" className="btn btn-secondary">
                Cancel
              </Link>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={create.isPending}
              >
                {create.isPending ? 'Saving…' : 'Save inquiry'}
                {!create.isPending && (
                  <ArrowRight size={17} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
