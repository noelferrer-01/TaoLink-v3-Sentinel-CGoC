/**
 * Time / window utilities shared across modules and UI.
 */

/**
 * 5-minute "Gmail-style" undo window for destructive actions. Used by
 * `hr.undoTermination` and `clients.deleteClient` to decide whether a fresh
 * mistake can still be reversed. After this window, the action is permanent —
 * archive / re-create flows take over.
 */
export const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * Returns true when `ts` is within `windowMs` of now. Used to gate the
 * 5-minute undo affordances on both the server (delete / undo APIs) and the
 * client (countdown buttons).
 */
export function isWithinUndoWindow(ts: Date, windowMs: number = FIVE_MIN_MS): boolean {
  return Date.now() - ts.getTime() <= windowMs;
}
