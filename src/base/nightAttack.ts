import { BASE } from '../config/base';
import type { Rng } from '../core/rng';
import type { GameState } from '../state/types';
import type { DayReport } from './types';

/** 夜の襲来の自動判定（P2）。壁へのダメージはここでは当てない */
export function rollNightAttack(s: GameState, rng: Rng): NonNullable<DayReport['nightAttack']> {
  const none = { happened: false, power: 0, defense: 0, wallDamage: 0 };
  if (!rng.chance(BASE.nightAttackBase + BASE.nightAttackPerChapter * s.chapter)) return none;
  const power = rng.int(5, 15) * s.chapter;
  const readySoldiers = s.soldiers.filter((p) => p.status.kind === 'ready').length;
  const readyCaptains = s.captains.filter((p) => p.status.kind === 'ready').length;
  const defense = 10 * s.base.wall.stage + readySoldiers + readyCaptains * 3;
  return { happened: true, power, defense, wallDamage: Math.max(0, power - defense) * 2 };
}
