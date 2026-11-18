import { describe, expect, it, vi } from 'vitest';
import Home from './page';

const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ redirect }));

describe('homepage', () => {
  it('sends visitors to the workspace', () => {
    Home();
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });
});
