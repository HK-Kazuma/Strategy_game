import { describe, expect, it } from 'vitest';
import { emptyInput } from '../core/input';
import { angleOf, dist, fromAngle, norm, sub, add, scale } from '../core/geometry';
import { createPrototypeSetup } from './stage';
import { createWorld, stepWorld } from './world';
import { isInNapeZone, partPos } from './titan';

// 「背後に回ってうなじを斬る」ボットで、戦闘ロジックが最後まで通ることを確かめる
function runBot(seed: number) {
  const w = createWorld(createPrototypeSetup(seed));
  const dt = 1 / 60;
  const input = emptyInput();
  for (let i = 0; i < 60 * 180 && !w.result; i++) {
    const alive = w.titans.filter((t) => t.state.kind !== 'dying');
    const t = alive.reduce((b, x) => (dist(x.pos, w.hero.pos) < dist(b.pos, w.hero.pos) ? x : b), alive[0]);
    input.anchorPressed = false; input.attackHeld = false; input.reloadPressed = false; input.move = { x: 0, z: 0 };
    if (t) {
      if (w.hero.state.kind === 'ground') {
        if (isInNapeZone(w.hero.pos, t) && w.hero.gas >= 8) {
          input.anchorPressed = true; input.cursor = { ...t.pos };
        } else {
          const goal = add(t.pos, scale(fromAngle(t.facing + Math.PI), t.size * 0.6));
          input.move = norm(sub(goal, w.hero.pos));
          input.cursor = { ...t.pos };
          if (dist(w.hero.pos, partPos(t, 'legL')) < 2.2) input.attackHeld = true;
        }
      }
      if (w.hero.bladeDur <= 0) input.reloadPressed = true;
    }
    stepWorld(w, input, dt);
    input.reloadPressed = false;
  }
  return w;
}

describe('ボットによる通し', () => {
  it('うなじ斬りで巨人を倒せる（少なくとも1体は主人公が倒す）', () => {
    let heroKills = 0;
    for (const seed of [1, 2, 3]) {
      const w = runBot(seed);
      heroKills += w.kills.filter((k) => k.byHero).length;
    }
    expect(heroKills).toBeGreaterThan(0);
  });
  it('終了すると結果が出る', () => {
    const w = runBot(1);
    console.log(JSON.stringify(w.result), 'time', w.time.toFixed(1));
    expect(angleOf({ x: 1, z: 0 })).toBe(0);
  });
});
