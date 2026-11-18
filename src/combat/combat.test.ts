import { describe, expect, it } from 'vitest';
import { COMBAT as C } from '../config/combat';
import { inSector } from '../core/geometry';
import { emptyInput } from '../core/input';
import { createPrototypeSetup } from './stage';
import { createWorld, stepWorld } from './world';
import { damagePart, resolveIntents, updateGrabs } from './resolve';
import { createTitan, isInNapeZone, regenParts } from './titan';
import { updateHero } from './player';
import type { CombatWorld, TitanEntity } from './types';

const rad = (d: number) => (d * Math.PI) / 180;

function world(): CombatWorld {
  return createWorld(createPrototypeSetup(1));
}
function titan(size = 10, kind: TitanEntity['kind'] = 'normal'): TitanEntity {
  return createTitan('tx', kind, size, { x: 0, z: 0 }, 0);
}

describe('geometry', () => {
  it('inSector 内側', () => expect(inSector({ x: 0, z: 0 }, 0, 5, rad(45), { x: 3, z: 1 })).toBe(true));
  it('inSector 後ろ', () => expect(inSector({ x: 0, z: 0 }, 0, 5, rad(45), { x: -3, z: 0 })).toBe(false));
});

describe('titan', () => {
  it('うなじゾーン：背後は true', () => expect(isInNapeZone({ x: -5, z: 0 }, titan())).toBe(true));
  it('うなじゾーン：正面は false', () => expect(isInNapeZone({ x: 5, z: 0 }, titan())).toBe(false));

  it('damagePart で脚が壊れると kneel', () => {
    const w = world();
    const t = titan();
    const ev = damagePart(t, 'legL', t.parts.legL.max, w);
    expect(t.parts.legL.broken).toBe(true);
    expect(t.state.kind).toBe('kneel');
    expect(ev.filter((e) => e.kind === 'partBroken')).toHaveLength(1);
  });

  it('regenParts：壊れた脚は regenTime 秒で再生', () => {
    const w = world();
    const t = titan();
    damagePart(t, 'legL', 999, w);
    regenParts(t, C.regenTime);
    expect(t.parts.legL.broken).toBe(false);
    expect(t.parts.legL.hp).toBe(t.parts.legL.max);
  });
});

describe('grab', () => {
  function grabSetup(captain: boolean) {
    const w = world();
    const t = w.titans[0];
    const s = w.soldiers.find((x) => x.isCaptain === captain && x.captainType !== 'rescuer')!;
    s.state = { kind: 'grabbed', titanId: t.id };
    t.state = { kind: 'holding', victimId: s.id, arm: 'armR', t: 0 };
    return { w, t, s };
  }
  it('隊員を掴んで holdTime で down', () => {
    const { w, s } = grabSetup(false);
    const ev = updateGrabs(w, C.holdTime);
    expect(s.state.kind).toBe('down');
    expect(ev.some((e) => e.kind === 'soldierDown')).toBe(true);
  });
  it('隊長を掴んで holdTime で captainKilled', () => {
    const { w, s } = grabSetup(true);
    const ev = updateGrabs(w, C.holdTime);
    expect(ev.some((e) => e.kind === 'captainKilled')).toBe(true);
    expect(w.deadCaptainIds).toContain(s.id);
  });
  it('掴んでいる腕を壊すと rescued', () => {
    const { w, t, s } = grabSetup(false);
    updateGrabs(w, 2);
    const ev = damagePart(t, 'armR', 999, w);
    expect(ev.some((e) => e.kind === 'rescued')).toBe(true);
    expect(s.state.kind).not.toBe('grabbed');
  });
});

describe('hero', () => {
  it('bladeDur=0 では斬撃が積まれない', () => {
    const w = world();
    w.hero.bladeDur = 0;
    const input = { ...emptyInput(), attackHeld: true };
    updateHero(w.hero, input, w, 1 / 60);
    expect(w.pending.some((p) => p.kind === 'heroSlash')).toBe(false);
  });
  it('gas=5 ではアンカーできない', () => {
    const w = world();
    w.hero.gas = 5;
    const t = w.titans[0];
    t.pos = { x: w.hero.pos.x + 8, z: w.hero.pos.z };
    const input = { ...emptyInput(), anchorPressed: true, cursor: { ...t.pos } };
    updateHero(w.hero, input, w, 1 / 60);
    expect(w.hero.state.kind).not.toBe('reeling');
  });
  it('gas が足りればアンカーできる', () => {
    const w = world();
    const t = w.titans[0];
    t.pos = { x: w.hero.pos.x + 8, z: w.hero.pos.z };
    const input = { ...emptyInput(), anchorPressed: true, cursor: { ...t.pos } };
    updateHero(w.hero, input, w, 1 / 60);
    expect(w.hero.state.kind).toBe('reeling');
  });
});

describe('napeStrike', () => {
  it('知性巨人は両腕があるとうなじが減らない', () => {
    const w = world();
    const t = createTitan('ti', 'intelligent', 10, { x: 20, z: 20 }, 0);
    w.titans = [t];
    w.pending.push({ kind: 'napeStrike', titanId: 'ti' });
    resolveIntents(w);
    expect(t.parts.nape.hp).toBe(t.parts.nape.max);
  });
  it('通常種は1撃で倒れる', () => {
    const w = world();
    const t = createTitan('tn', 'normal', 10, { x: 20, z: 20 }, 0);
    w.titans = [t];
    w.pending.push({ kind: 'napeStrike', titanId: 'tn' });
    const ev = resolveIntents(w);
    expect(ev.some((e) => e.kind === 'titanKilled')).toBe(true);
    expect(t.state.kind).toBe('dying');
  });
});

describe('シミュレーション', () => {
  it('入力なしでも例外なく30秒進み、同じシードで同じ結果になる', () => {
    const run = () => {
      const w = world();
      const input = emptyInput();
      for (let i = 0; i < 60 * 30; i++) stepWorld(w, input, 1 / 60);
      return w.soldiers.map((s) => `${s.state.kind}:${s.pos.x.toFixed(2)}`).join(',') + '|' + w.titans.map((t) => t.state.kind).join(',');
    };
    expect(run()).toBe(run());
  });
});
