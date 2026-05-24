import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetailLayout } from './detail-layout';

function makeProps(overrides: Partial<Parameters<typeof DetailLayout>[0]> = {}) {
  return {
    viewContent: <div>View content</div>,
    editContent: <div>Edit content</div>,
    isDirty: false,
    onEdit: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    isSaving: false,
    mode: 'view' as const,
    ...overrides,
  };
}

describe('DetailLayout', () => {
  it('renders view content and Edit button in view mode', () => {
    render(<DetailLayout {...makeProps()} />);
    expect(screen.getByText('View content')).toBeInTheDocument();
    expect(screen.getByTestId('edit-button')).toBeInTheDocument();
    expect(screen.queryByTestId('save-button')).not.toBeInTheDocument();
  });

  it('calls onEdit when Edit button is clicked', () => {
    const onEdit = vi.fn();
    render(<DetailLayout {...makeProps({ onEdit })} />);
    fireEvent.click(screen.getByTestId('edit-button'));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('renders edit content and Save/Cancel buttons in edit mode', () => {
    render(<DetailLayout {...makeProps({ mode: 'edit' })} />);
    expect(screen.getByText('Edit content')).toBeInTheDocument();
    expect(screen.getByTestId('save-button')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-button')).toBeInTheDocument();
    expect(screen.queryByTestId('edit-button')).not.toBeInTheDocument();
  });

  it('calls onSave when Save button is clicked', () => {
    const onSave = vi.fn();
    render(<DetailLayout {...makeProps({ mode: 'edit', onSave })} />);
    fireEvent.click(screen.getByTestId('save-button'));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('calls onCancel directly when form is not dirty', () => {
    const onCancel = vi.fn();
    render(<DetailLayout {...makeProps({ mode: 'edit', isDirty: false, onCancel })} />);
    fireEvent.click(screen.getByTestId('cancel-button'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  describe('dirty-state guard', () => {
    // vi.spyOn's return type is awkward to name precisely for built-in DOM
    // methods like window.confirm. Capture it at first assignment instead.
    let confirmSpy: ReturnType<typeof setupConfirmSpy>;

    function setupConfirmSpy() {
      return vi.spyOn(window, 'confirm').mockReturnValue(false);
    }

    beforeEach(() => {
      confirmSpy = setupConfirmSpy();
    });

    afterEach(() => {
      confirmSpy.mockRestore();
    });

    it('shows confirm dialog when Cancel is clicked with dirty form', () => {
      const onCancel = vi.fn();
      render(<DetailLayout {...makeProps({ mode: 'edit', isDirty: true, onCancel })} />);
      fireEvent.click(screen.getByTestId('cancel-button'));
      expect(confirmSpy).toHaveBeenCalled();
    });

    it('does not call onCancel when confirm is dismissed', () => {
      confirmSpy.mockReturnValue(false);
      const onCancel = vi.fn();
      render(<DetailLayout {...makeProps({ mode: 'edit', isDirty: true, onCancel })} />);
      fireEvent.click(screen.getByTestId('cancel-button'));
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('calls onCancel when confirm is accepted', () => {
      confirmSpy.mockReturnValue(true);
      const onCancel = vi.fn();
      render(<DetailLayout {...makeProps({ mode: 'edit', isDirty: true, onCancel })} />);
      fireEvent.click(screen.getByTestId('cancel-button'));
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });

  it('shows "Saving…" label and disables buttons when isSaving is true', () => {
    render(<DetailLayout {...makeProps({ mode: 'edit', isSaving: true })} />);
    expect(screen.getByTestId('save-button')).toBeDisabled();
    expect(screen.getByTestId('save-button')).toHaveTextContent('Saving…');
    expect(screen.getByTestId('cancel-button')).toBeDisabled();
  });

  it('renders viewActions alongside Edit button in view mode', () => {
    render(
      <DetailLayout
        {...makeProps({ viewActions: <button data-testid="status-btn">Change Status</button> })}
      />,
    );
    expect(screen.getByTestId('status-btn')).toBeInTheDocument();
    expect(screen.getByTestId('edit-button')).toBeInTheDocument();
  });

  it('registers beforeunload handler when isDirty is true', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(<DetailLayout {...makeProps({ mode: 'edit', isDirty: true })} />);
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    addSpy.mockRestore();
  });

  it('does not register beforeunload handler when form is clean', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(<DetailLayout {...makeProps({ mode: 'edit', isDirty: false })} />);
    const calls = addSpy.mock.calls.filter((c) => c[0] === 'beforeunload');
    expect(calls).toHaveLength(0);
    addSpy.mockRestore();
  });
});
