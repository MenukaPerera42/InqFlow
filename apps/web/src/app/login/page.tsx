import type { Metadata } from 'next';
import { LoginForm } from '@/components/login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-[440px]">
        <LoginForm />
      </div>
    </main>
  );
}
