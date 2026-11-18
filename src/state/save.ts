import type { GameState } from './types';

export const SAVE_KEY = 'titan-save-v1';

export function saveGame(s: GameState): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* 容量不足などは無視 */ }
}

/** 読み込み。なければ・壊れていれば・versionが違えば null（新規開始） */
export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s.version === 1 ? s : null; // migrate は将来
  } catch { return null; }
}

export function clearSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* */ }
}
