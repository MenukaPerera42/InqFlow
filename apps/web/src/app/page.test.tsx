import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('homepage', () => {
  it('shows the foundation status', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', {
        name: 'Customer Inquiry System foundation is ready.',
      }),
    ).toBeInTheDocument();
  });
});
