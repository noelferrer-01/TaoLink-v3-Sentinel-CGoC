import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SearchInput } from './search-input';

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with placeholder', () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Search employees…" />);
    expect(screen.getByPlaceholderText('Search employees…')).toBeInTheDocument();
  });

  it('does not fire onChange immediately on keystroke', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} debounceMs={250} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ali' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires onChange after debounce delay', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} debounceMs={250} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ali' } });
    act(() => { vi.advanceTimersByTime(250); });
    expect(onChange).toHaveBeenCalledWith('ali');
  });

  it('fires only once after rapid keystrokes (debounce collapses)', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} debounceMs={250} />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'al' } });
    fireEvent.change(input, { target: { value: 'ali' } });
    act(() => { vi.advanceTimersByTime(250); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ali');
  });

  it('does not show clear button when value is empty', () => {
    render(<SearchInput value="" onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
  });

  it('shows clear button when value is non-empty (local state)', () => {
    render(<SearchInput value="" onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'foo' } });
    expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
  });

  it('clicking clear fires onChange with empty string immediately', () => {
    const onChange = vi.fn();
    render(<SearchInput value="foo" onChange={onChange} />);
    // Manually trigger so local state also shows the value
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'foo' } });
    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('clear does not call the pending debounce timer', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} debounceMs={250} />);
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'foo' } });
    fireEvent.click(screen.getByLabelText('Clear search'));
    act(() => { vi.advanceTimersByTime(250); });
    // Should have been called once with '' (from clear), not twice
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('');
  });
});
