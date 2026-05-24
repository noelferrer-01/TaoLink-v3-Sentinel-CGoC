'use server';

import { revalidatePath } from 'next/cache';
import { hr } from '@/modules/hr';
import { getSessionFromCookie } from '@/modules/auth';

export type ImportState =
  | { kind: 'idle' }
  | {
      kind: 'done';
      imported: number;
      errors: Array<{ row: number; reason: string }>;
    }
  | { kind: 'error'; message: string };

export async function importCSV(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await getSessionFromCookie();
  if (!session) {
    return {
      kind: 'error',
      message: 'Your session expired. Please sign in again.',
    };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return {
      kind: 'error',
      message: 'Please choose a CSV file to import.',
    };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return {
      kind: 'error',
      message: "We couldn't read that file. Make sure it's a plain CSV.",
    };
  }

  try {
    const result = await hr.bulkImportEmployees(text, {
      actorUserId: session.user.id,
    });
    if (result.imported > 0) {
      revalidatePath('/employees');
    }
    return { kind: 'done', imported: result.imported, errors: result.errors };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      kind: 'error',
      message: `Import failed: ${message}`,
    };
  }
}
