import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageShell } from './page-shell';

describe('PageShell', () => {
  it('renders the page title', () => {
    render(<PageShell title="Employees"><p>body</p></PageShell>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Employees');
  });

  it('renders breadcrumb when provided', () => {
    render(<PageShell title="T" breadcrumb="Sentinel · Operations"><p>b</p></PageShell>);
    expect(screen.getByText('Sentinel · Operations')).toBeInTheDocument();
  });

  it('does not render breadcrumb when omitted', () => {
    render(<PageShell title="T"><p>b</p></PageShell>);
    expect(screen.queryByText(/Sentinel/)).not.toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<PageShell title="T" description="All employees on the roster."><p>b</p></PageShell>);
    expect(screen.getByText('All employees on the roster.')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<PageShell title="T"><p data-testid="body">body content</p></PageShell>);
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('renders toolbar content', () => {
    render(<PageShell title="T" toolbar={<button>+ Add</button>}><p>b</p></PageShell>);
    expect(screen.getByRole('button', { name: '+ Add' })).toBeInTheDocument();
  });

  it('renders footer hint when provided', () => {
    render(<PageShell title="T" footerHint="Select rows to bulk-assign."><p>b</p></PageShell>);
    expect(screen.getByText('Select rows to bulk-assign.')).toBeInTheDocument();
  });

  it('does not render footer when footerHint is omitted', () => {
    render(<PageShell title="T"><p>b</p></PageShell>);
    // No <footer> element
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });
});
