import { COMBAT as C } from '../config/combat';
import type { InputState } from '../core/input';
import { createRng } from '../core/rng';
import { inRect, pushOutCircle } from '../core/geometry';
import type { Vec2 } from '../state/types';
import type {
  CombatEvent, CombatResult, CombatSetup, CombatWorld, SoldierEntity,
} from './types';
import { createHero, updateHero } from './player';
import { bodyR, createTitan, updateTitan } from './titan';
import { updateSoldier } from './soldier';
import { resolveIntents, updateGrabs } from './resolve';

export function createWorld(setup: CombatSetup): CombatWorld {
  const rng = createRng(setup.seed);
  const hero = createHero(setup.hero, setup.stage.heroSpawn);
  const soldiers: SoldierEntity[] = [];
  let k = 0;
  for (const sq of setup.squads) {
    const members = [...(sq.captain ? [sq.captain] : []), ...sq.soldiers];
    members.forEach((m, i) => {
      const isCaptain = sq.captain?.id === m.id;
      soldiers.push({
        id: m.id, squadId: sq.squadId, isCaptain,
        captainType: isCaptain ? sq.captain!.type : null,
        level: m.level, hp: C.soldierHp + (isCaptain ? 20 : 0),
        pos: { x: setup.stage.heroSpawn.x - 2 - (k % 3) * 1.2, z: setup.stage.heroSpawn.z + ((k++ % 5) - 2) * 1.2 },
        vel: { x: 0, z: 0 }, facing: 0,
        state: { kind: 'follow' }, dangerT: 0, attackCd: rng.range(0, C.soldierAttackCd),
        slot: i,
      });
    });
  }
  const titans = setup.titans.map((t, i) => createTitan(`t${i + 1}`, t.kind, t.size, { ...t.pos }, rng.range(-Math.PI, Math.PI)));
  return {
    setup, time: 0, rng, hero, soldiers, titans,
    squadOrder: 'free', chargeT: 0, heroLastTargetId: null,
    pending: [], events: [], gathered: {},
    kills: [], deadCaptainIds: [], result: null,
  };
}

/** 円(pos,r)をステージの障害物・巨人の胴体・外周から押し出す */
function pushOutAll(pos: Vec2, r: number, w: CombatWorld, ignoreTitanId?: string): Vec2 {
  let p = pos;
  for (const o of w.setup.stage.obstacles) p = pushOutCircle(p, r, o.pos, o.r);
  for (const t of w.titans) {
    if (t.id === ignoreTitanId || t.state.kind === 'dying') continue;
    p = pushOutCircle(p, r, t.pos, bodyR(t.size));
  }
  const st = w.setup.stage;
  return { x: Math.min(st.w - r, Math.max(r, p.x)), z: Math.min(st.h - r, Math.max(r, p.z)) };
}

/** 1ステップ（固定dt）進める */
export function stepWorld(w: CombatWorld, input: InputState, dt: number): CombatEvent[] {
  if (w.result) return [];
  w.events = [];
  w.pending = [];
  w.time += dt;

  // 号令
  if (input.orderPressed && input.orderPressed !== 'charge') {
    w.squadOrder = input.orderPressed;
    w.chargeT = 0;
  }
  if (w.chargeT > 0) {
    w.chargeT -= dt;
    if (w.chargeT <= 0) w.squadOrder = 'free';
  }

  // 更新（意図を積む）
  updateHero(w.hero, input, w, dt);
  for (const s of w.soldiers) updateSoldier(s, w, dt, w.rng);
  for (const t of w.titans) updateTitan(t, w, dt, w.rng);

  // 判定
  resolveIntents(w);
  updateGrabs(w, dt);

  // 押し戻し
  const h = w.hero;
  if (h.state.kind !== 'mounted') {
    const ignore = h.state.kind === 'reeling' && h.state.target.kind === 'titan' ? h.state.target.titanId : undefined;
    h.pos = pushOutAll(h.pos, C.heroRadius, w, ignore);
  }
  for (const s of w.soldiers) {
    if (s.state.kind === 'grabbed') continue;
    s.pos = pushOutAll(s.pos, C.soldierRadius, w);
  }

  // 消えた巨人の片付け
  w.titans = w.titans.filter((t) => !(t.state.kind === 'dying' && t.state.t >= C.dyingTime));

  checkEnd(w);
  return w.events;
}

function checkEnd(w: CombatWorld): void {
  const h = w.hero;
  const e = w.setup.stage.exit;
  const inExit = inRect(e, h.pos);
  const allDead = w.titans.every((t) => t.state.kind === 'dying');
  let outcome: CombatResult['outcome'] | null = null;

  if (h.state.kind === 'down') outcome = 'heroDown';
  else if (w.squadOrder === 'retreat' && inExit) outcome = 'retreat';
  else if (w.setup.objective === 'annihilate' && allDead) outcome = 'victory';
  else if (w.setup.objective === 'breakthrough' && inExit) outcome = 'victory';
  if (!outcome) return;

  w.result = buildResult(w, outcome);
}

export function buildResult(w: CombatWorld, outcome: CombatResult['outcome']): CombatResult {
  const injured = w.soldiers
    .filter((s) => s.state.kind === 'down' && !w.deadCaptainIds.includes(s.id))
    .map((s) => s.id);
  return {
    outcome,
    kills: [...w.kills],
    gasLeft: Math.floor(w.hero.gas),
    bladesLeft: w.hero.spareBlades + (w.hero.bladeDur > 0 ? 1 : 0),
    injuredSoldierIds: injured,
    deadCaptainIds: [...w.deadCaptainIds],
    heroInjured: outcome === 'heroDown',
    durationSec: w.time,
  };
}
