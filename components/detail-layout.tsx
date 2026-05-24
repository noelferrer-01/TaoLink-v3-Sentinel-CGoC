'use client';

/**
 * DetailLayout — view/edit mode toggle for master-record detail pages.
 *
 * Usage:
 *   <DetailLayout
 *     viewContent={<EmployeeView employee={e} />}
 *     editContent={<EmployeeEditForm employee={e} onSave={...} />}
 *     isDirty={formDirty}
 *     onEdit={() => setMode('edit')}
 *     onCancel={() => { resetForm(); setMode('view'); }}
 *     onSave={() => submit()}
 *     isSaving={pending}
 *   />
 *
 * Dirty-state guard:
 * - `window.beforeunload` warns if `isDirty` is true (browser tab close / refresh)
 * - Uses `window.confirm` dialog when the user clicks Cancel with unsaved changes.
 *   (Next.js router-level guard is handled by the consuming page via usePathname / useRouter
 *    since this component doesn't know which router the page uses.)
 */

import { useEffect, type ReactNode } from 'react';

export interface DetailLayoutProps {
  /** Content rendered in view (read-only) mode */
  viewContent: ReactNode;
  /** Content rendered in edit mode */
  editContent: ReactNode;
  /** Whether the form has unsaved changes */
  isDirty?: boolean;
  /** Called when user clicks [Edit] — consumer switches to edit mode */
  onEdit: () => void;
  /** Called when user clicks [Cancel] (after dirty-state guard) */
  onCancel: () => void;
  /** Called when user clicks [Save] */
  onSave: () => void;
  /** Disable Save button while a network request is in flight */
  isSaving?: boolean;
  /** Current mode — controlled externally */
  mode: 'view' | 'edit';
  /** Optional extra actions in view mode (e.g., [Change Status]) */
  viewActions?: ReactNode;
}

export function DetailLayout({
  viewContent,
  editContent,
  isDirty = false,
  onEdit,
  onCancel,
  onSave,
  isSaving = false,
  mode,
  viewActions,
}: DetailLayoutProps) {
  // Browser beforeunload guard
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers show their own message; setting returnValue triggers the dialog
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  function handleCancel() {
    if (isDirty) {
      const confirmed = window.confirm(
        'You have unsaved changes. Discard them and go back to view?',
      );
      if (!confirmed) return;
    }
    onCancel();
  }

  return (
    <div data-testid="detail-layout" data-mode={mode}>
      {/* Action bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          marginBottom: '1.75rem',
          justifyContent: 'flex-end',
        }}
      >
        {mode === 'view' ? (
          <>
            {viewActions}
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onEdit}
              data-testid="edit-button"
            >
              Edit
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleCancel}
              disabled={isSaving}
              data-testid="cancel-button"
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={onSave}
              disabled={isSaving}
              data-testid="save-button"
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        )}
      </div>

      {/* Content */}
      {mode === 'view' ? viewContent : editContent}
    </div>
  );
}
