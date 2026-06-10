import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { Typeahead } from './typeahead';

type Person = { id: string; name: string };

function makeFetch(results: Person[]): (query: string) => Promise<Person[]> {
  return vi.fn().mockResolvedValue(results);
}

describe('Typeahead', () => {
  // Use real timers for async tests so promises settle normally.
  // We override debounceMs=0 to skip the wait.
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('renders the input', () => {
    render(
      <Typeahead
        fetchOptions={makeFetch([])}
        itemToString={(p) => p?.name ?? ''}
        onSelect={vi.fn()}
        placeholder="Pick a person"
      />,
    );
    expect(screen.getByPlaceholderText('Pick a person')).toBeInTheDocument();
  });

  it('does not call fetchOptions when input is below minChars', async () => {
    const fetch = makeFetch([]);
    render(
      <Typeahead
        fetchOptions={fetch}
        itemToString={(p) => p?.name ?? ''}
        onSelect={vi.fn()}
        minChars={2}
        debounceMs={0}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'a' } });
    // Give microtasks a chance to run
    await act(async () => { await Promise.resolve(); });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls fetchOptions after debounce when minChars is met', async () => {
    const fetch = makeFetch([{ id: '1', name: 'Alice' }]);
    render(
      <Typeahead
        fetchOptions={fetch}
        itemToString={(p) => p?.name ?? ''}
        onSelect={vi.fn()}
        minChars={2}
        debounceMs={0}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'al' } });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(fetch).toHaveBeenCalledWith('al');
  });

  it('renders fetched options in the dropdown', async () => {
    const fetch = makeFetch([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    render(
      <Typeahead
        fetchOptions={fetch}
        itemToString={(p) => p?.name ?? ''}
        onSelect={vi.fn()}
        minChars={2}
        debounceMs={0}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'li' } });
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('calls onSelect when an option is clicked', async () => {
    const onSelect = vi.fn();
    const fetch = makeFetch([{ id: '1', name: 'Alice' }]);
    render(
      <Typeahead
        fetchOptions={fetch}
        itemToString={(p) => p?.name ?? ''}
        onSelect={onSelect}
        minChars={2}
        debounceMs={0}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'al' } });
    await waitFor(() => screen.getByText('Alice'), { timeout: 3000 });
    fireEvent.click(screen.getByText('Alice'));
    expect(onSelect).toHaveBeenCalledWith({ id: '1', name: 'Alice' });
  });

  it('shows "No results found" when fetch returns empty', async () => {
    const fetch = makeFetch([]);
    render(
      <Typeahead
        fetchOptions={fetch}
        itemToString={(p) => p?.name ?? ''}
        onSelect={vi.fn()}
        minChars={2}
        debounceMs={0}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } });
    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('uses custom renderItem when provided', async () => {
    const fetch = makeFetch([{ id: '1', name: 'Alice' }]);
    render(
      <Typeahead
        fetchOptions={fetch}
        itemToString={(p) => p?.name ?? ''}
        onSelect={vi.fn()}
        renderItem={(item: Person) => <span data-testid="custom-item">{item.name} custom</span>}
        minChars={2}
        debounceMs={0}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'al' } });
    await waitFor(() => screen.getByTestId('custom-item'), { timeout: 3000 });
    expect(screen.getByTestId('custom-item')).toHaveTextContent('Alice custom');
  });

  it('debounce collapses rapid keystrokes into one fetch call', async () => {
    const fetch = makeFetch([]);
    render(
      <Typeahead
        fetchOptions={fetch}
        itemToString={(p) => p?.name ?? ''}
        onSelect={vi.fn()}
        minChars={2}
        debounceMs={50}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'al' } });
    fireEvent.change(input, { target: { value: 'ali' } });
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    // Only one call because the first two were cancelled by the debounce
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('ali');
  });
});
