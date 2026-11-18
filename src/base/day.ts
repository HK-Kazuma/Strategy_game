import { BASE } from '../config/base';
import type { Rng } from '../core/rng';
import type { GameState, Resources } from '../state/types';
import { feed, grow, heal, produce, train, updateMorale } from './economy';
import { rollNightAttack } from './nightAttack';
import type { DayReport, PhaseEvent, TodayAcc } from './types';

const addTo = (dst: Partial<Resources>, src: Partial<Resources>) => {
  for (const k of Object.keys(src) as (keyof Resources)[]) dst[k] = (dst[k] ?? 0) + src[k]!;
};

export const emptyToday = (s: Pick<GameState, 'civilians' | 'morale'>): TodayAcc => ({
  produced: {}, consumed: {}, notes: [], civiliansStart: s.civilians, moraleStart: s.morale,
});

/** フェーズを1つ進める。夜が終わると日報を作って翌朝へ */
export function advancePhase(s: GameState, rng: Rng): { report?: DayReport; events: PhaseEvent[] } {
  const events: PhaseEvent[] = [];
  const today = s.base.today;

  if (s.phase === 'morning') {
    s.base.today = emptyToday(s);
    s.phase = 'day';
    return { events };
  }

  if (s.phase === 'day') {
    const { produced, consumed } = produce(s);
    addTo(today.produced, produced);
    addTo(today.consumed, consumed);
    const before = s.resources.food;
    const trained = train(s, rng);
    if (trained) {
      addTo(today.consumed, { food: before - s.resources.food });
      today.notes.push(`${trained.name}が兵士になりました`);
    }
    for (const b of s.base.buildings) {
      if (b.status.kind === 'constructing') {
        b.status.daysLeft -= 1;
        if (b.status.daysLeft <= 0) b.status = { kind: 'active' };
      }
    }
    s.phase = 'night';
    return { events };
  }

  // night
  const { eaten, shortage } = feed(s);
  addTo(today.consumed, { food: eaten });
  if (shortage > 0) today.notes.push(`食料が足りません（不足 ${shortage}）`);
  if (s.base.hungerStreak >= BASE.hungerLeaveAfter) today.notes.push('飢えで住民が拠点を去りました');
  const grew = grow(s);
  if (grew > 0) today.notes.push(`住民が${grew}人増えました`);
  const recovered = heal(s);
  const moraleBefore = today.moraleStart;
  updateMorale(s, shortage);

  const attack = rollNightAttack(s, rng);
  if (attack.happened) {
    events.push({ kind: 'nightAttack' });
    const w = s.base.wall;
    w.hp = Math.max(0, w.hp - attack.wallDamage);
    today.notes.push(`夜襲：強さ${attack.power} / 防御${attack.defense} / 壁へのダメージ${attack.wallDamage}`);
    if (w.hp <= 0) { events.push({ kind: 'wallBroken' }); today.notes.push('壁が破られました！'); }
  }

  const report: DayReport = {
    day: s.day,
    produced: today.produced, consumed: today.consumed,
    civiliansDelta: s.civilians - today.civiliansStart,
    moraleDelta: s.morale - moraleBefore,
    recovered,
    nightAttack: attack,
    notes: today.notes,
  };
  s.log.push(report);
  if (s.log.length > BASE.logDays) s.log.splice(0, s.log.length - BASE.logDays);
  s.day += 1;
  s.phase = 'morning';
  s.base.today = emptyToday(s);
  return { report, events };
}
