import { COMBAT as C } from '../config/combat';
import { add, dist, inSector, norm, scale, sub } from '../core/geometry';
import type { Vec2 } from '../state/types';
import type {
  CombatEvent, CombatWorld, PartId, SoldierEntity, TitanAttack, TitanEntity,
} from './types';
import { inAttackZone, isAlive, partPos } from './titan';

const titanById = (w: CombatWorld, id: string) => w.titans.find((t) => t.id === id);
const soldierById = (w: CombatWorld, id: string) => w.soldiers.find((s) => s.id === id);

/** 積まれた意図をまとめて判定する。起きたことは w.events にも追加される */
export function resolveIntents(w: CombatWorld): CombatEvent[] {
  const out: CombatEvent[] = [];
  const pending = w.pending;
  w.pending = [];
  for (const it of pending) {
    switch (it.kind) {
      case 'heroSlash': out.push(...heroSlash(w)); break;
      case 'napeStrike': {
        const t = titanById(w, it.titanId);
        if (t) out.push(...napeStrike(t, C.napeDmg, true, w));
        break;
      }
      case 'soldierSlash': {
        const s = soldierById(w, it.soldierId);
        const t = titanById(w, it.titanId);
        if (s && t && s.state.kind !== 'down' && s.state.kind !== 'grabbed') out.push(...soldierSlash(s, t, it.part, w));
        break;
      }
      case 'titanAttack': {
        const t = titanById(w, it.titanId);
        if (t && isAlive(t)) out.push(...resolveTitanAttack(t, it.attack, it.aim, w));
        break;
      }
    }
  }
  w.events.push(...out);
  return out;
}

function heroSlash(w: CombatWorld): CombatEvent[] {
  const h = w.hero;
  let best: { t: TitanEntity; part: PartId; d: number } | null = null;
  for (const t of w.titans) {
    if (!isAlive(t)) continue;
    for (const part of ['legL', 'legR', 'armL', 'armR'] as const) {
      if (t.parts[part].broken) continue;
      const pp = partPos(t, part);
      if (!inSector(h.pos, h.facing, C.slashRange, C.slashHalfAngle, pp)) continue;
      const d = dist(h.pos, pp);
      if (!best || d < best.d) best = { t, part, d };
    }
  }
  if (!best) return [{ kind: 'heroSlashed', hit: false }];
  const mul = 1 + 0.1 * (w.setup.hero.gear.blade - 1);
  const ev = damagePart(best.t, best.part, C.heroSlashDmg * mul, w);
  h.superCharge = Math.min(1, h.superCharge + C.superGainSlash);
  w.heroLastTargetId = best.t.id;
  return [{ kind: 'heroSlashed', hit: true }, ...ev];
}

/** うなじへの攻撃。知性巨人は両腕が残っていれば弾かれる */
function napeStrike(t: TitanEntity, dmg: number, byHero: boolean, w: CombatWorld): CombatEvent[] {
  if (!isAlive(t)) return [];
  if (t.kind === 'intelligent' && !t.parts.armL.broken && !t.parts.armR.broken) return [];
  const nape = t.parts.nape;
  nape.hp -= dmg;
  if (nape.hp > 0) return [];
  nape.hp = 0;
  nape.broken = true;
  return killTitan(t, byHero, w);
}

function killTitan(t: TitanEntity, byHero: boolean, w: CombatWorld): CombatEvent[] {
  const ev: CombatEvent[] = [];
  if (t.state.kind === 'holding') ev.push(...releaseVictim(t, w));
  t.state = { kind: 'dying', t: 0 };
  w.kills.push({ kind: t.kind, size: t.size, byHero });
  if (byHero) w.hero.superCharge = Math.min(1, w.hero.superCharge + C.superGainKill);
  ev.push({ kind: 'titanKilled', titanId: t.id, byHero });
  return ev;
}

function soldierSlash(s: SoldierEntity, t: TitanEntity, part: PartId, w: CombatWorld): CombatEvent[] {
  if (!isAlive(t)) return [];
  if (part === 'nape') return napeStrike(t, C.napeDmg, false, w);
  let dmg = C.soldierDmgBase + s.level;
  if (s.captainType === 'holder' && (part === 'legL' || part === 'legR')) dmg *= C.holderLegMul;
  return damagePart(t, part, dmg, w);
}

/** 部位にダメージ。壊れたら膝つき・救出などを処理する */
export function damagePart(t: TitanEntity, part: PartId, dmg: number, w: CombatWorld): CombatEvent[] {
  const p = t.parts[part];
  if (p.broken || t.state.kind === 'dying') return [];
  p.hp -= dmg;
  p.lastHitT = 0;
  if (p.hp > 0) return [];
  p.hp = 0;
  p.broken = true;
  p.regenT = C.regenTime;
  const ev: CombatEvent[] = [{ kind: 'partBroken', titanId: t.id, part }];
  if (part === 'legL' || part === 'legR') {
    const k = t.state.kind;
    if (k !== 'holding' && k !== 'shaking') t.state = { kind: 'kneel', t: 0 };
  } else if (t.state.kind === 'holding' && t.state.arm === part) {
    ev.push(...releaseVictim(t, w));
    t.state = { kind: 'chase', targetId: 'hero' };
  }
  return ev;
}

/** 掴まれている獲物を放す */
function releaseVictim(t: TitanEntity, w: CombatWorld): CombatEvent[] {
  if (t.state.kind !== 'holding') return [];
  const s = soldierById(w, t.state.victimId);
  if (!s || s.state.kind !== 'grabbed') return [];
  s.state = { kind: 'follow' };
  return [{ kind: 'rescued', victimId: s.id }];
}

function hurtHero(w: CombatWorld, dmg: number): CombatEvent[] {
  const h = w.hero;
  const k = h.state.kind;
  if (k === 'dodging' || k === 'mounted' || k === 'down') return [];
  h.hp -= dmg;
  return [{ kind: 'heroHit', dmg }];
}

function hurtSoldier(s: SoldierEntity, dmg: number): CombatEvent[] {
  s.hp -= dmg;
  if (s.hp > 0) return [];
  s.hp = 0;
  s.state = { kind: 'down' };
  return [{ kind: 'soldierDown', soldierId: s.id }];
}

/** 巨人の攻撃を判定する */
export function resolveTitanAttack(t: TitanEntity, attack: TitanAttack, aim: Vec2, w: CombatWorld): CombatEvent[] {
  void aim;
  const ev: CombatEvent[] = [];
  const h = w.hero;
  const heroIn = h.state.kind !== 'down' && h.state.kind !== 'mounted' && inAttackZone(t, attack, h.pos);
  const soldiersIn = w.soldiers.filter((s) =>
    s.state.kind !== 'down' && s.state.kind !== 'grabbed' && s.state.kind !== 'evade' && inAttackZone(t, attack, s.pos));

  if (attack === 'grab') {
    if (heroIn && h.state.kind !== 'dodging') {
      ev.push(...hurtHero(w, C.grabDmgHero));
      h.state = { kind: 'stunned', t: 1 };
    }
    const arm = !t.parts.armR.broken ? 'armR' : !t.parts.armL.broken ? 'armL' : null;
    if (arm && soldiersIn.length > 0) {
      const weight = (s: SoldierEntity) => dist(s.pos, t.pos) * (s.captainType === 'striker' ? C.strikerGrabWeight : 1);
      const victim = soldiersIn.reduce((b, s) => (weight(s) < weight(b) ? s : b));
      victim.state = { kind: 'grabbed', titanId: t.id };
      t.state = { kind: 'holding', victimId: victim.id, arm, t: 0 };
      ev.push({ kind: 'grabbed', titanId: t.id, victimId: victim.id });
    }
    return ev;
  }

  const dmg = attack === 'stomp' ? C.stompDmg : C.swipeDmg;
  if (heroIn) {
    ev.push(...hurtHero(w, dmg));
    if (h.state.kind !== 'dodging' && attack === 'swipe') {
      h.pos = add(h.pos, scale(norm(sub(h.pos, t.pos)), C.swipeKnock));
      h.state = { kind: 'stunned', t: 0.4 };
    }
  }
  for (const s of soldiersIn) {
    ev.push(...hurtSoldier(s, dmg));
    if (attack === 'swipe') s.pos = add(s.pos, scale(norm(sub(s.pos, t.pos)), C.swipeKnock));
  }
  return ev;
}

/** 掴みの進行。holdTimeを超えたら獲物は重傷（隊長なら戦死） */
export function updateGrabs(w: CombatWorld, dt: number): CombatEvent[] {
  const ev: CombatEvent[] = [];
  for (const t of w.titans) {
    if (t.state.kind !== 'holding') continue;
    const victim = soldierById(w, t.state.victimId);
    if (!victim || victim.state.kind !== 'grabbed') {
      t.state = { kind: 'chase', targetId: 'hero' };
      continue;
    }
    t.state.t += dt;
    const sq = w.setup.squads.find((q) => q.squadId === victim.squadId);
    const mul = sq?.captain?.type === 'rescuer' ? C.rescuerHoldMul : 1;
    if (t.state.t < C.holdTime * mul) continue;
    victim.state = { kind: 'down' };
    if (victim.isCaptain) {
      w.deadCaptainIds.push(victim.id);
      ev.push({ kind: 'captainKilled', soldierId: victim.id });
    } else {
      ev.push({ kind: 'soldierDown', soldierId: victim.id });
    }
    t.state = { kind: 'chase', targetId: 'hero' };
  }
  w.events.push(...ev);
  return ev;
}
