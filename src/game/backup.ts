import { decode, encode, type Action } from './garden';

/**
 * A garden backup: a small file holding the stroke list (the same compact form as the save),
 * plus the meadow's growth and the mown setting, to keep somewhere safe and restore from.
 */
interface BackupFile {
  kind: 'garden-game-backup';
  v: 1;
  saved: string;
  garden: string;
  meadow?: number;
  keepMown?: boolean;
}

export function makeBackup(actions: Action[], meadow: number, keepMown: boolean): File {
  const body: BackupFile = { kind: 'garden-game-backup', v: 1, saved: new Date().toISOString(), garden: encode(actions), meadow, keepMown };
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const name = `my-garden-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
  return new File([JSON.stringify(body)], name, { type: 'application/json' });
}

/** Reads a backup file; throws if it isn't one. */
export async function readBackup(file: File): Promise<{ actions: Action[]; meadow?: number; keepMown?: boolean }> {
  const body = JSON.parse(await file.text()) as Partial<BackupFile>;
  if (body.kind !== 'garden-game-backup' || typeof body.garden !== 'string') throw new Error('not a garden backup');
  return { actions: decode(body.garden), meadow: body.meadow, keepMown: body.keepMown };
}

/** Ask the browser to keep the garden's storage even when space runs low (iOS may clear it). */
export function keepStorage() {
  void navigator.storage?.persisted?.().then((already) => {
    if (!already) return navigator.storage.persist?.();
  }).catch(() => {});
}
