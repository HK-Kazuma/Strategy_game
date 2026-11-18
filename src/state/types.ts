// 共通の型（設計書「共通データモデル」）。P2以降の型は各章で追加する。
export type Vec2 = { x: number; z: number };

export type ResourceId =
  | 'wood' | 'stone' | 'food'
  | 'ironOre' | 'crystal'
  | 'iron' | 'gas' | 'blades';
export type Resources = Record<ResourceId, number>;

export type UnitStatus =
  | { kind: 'ready' }
  | { kind: 'away' }
  | { kind: 'injured'; daysLeft: number }
  | { kind: 'dead'; day: number };

export type CaptainType = 'holder' | 'rescuer' | 'scout' | 'striker';

export interface Soldier { id: string; name: string; level: number; xp: number; status: UnitStatus }
export interface Captain extends Soldier { type: CaptainType }
export interface Squad { id: string; captainId: string | null; soldierIds: string[] }

export type Rank = 'private' | 'leader' | 'squadLeader' | 'commander';
export interface Hero {
  rank: Rank; merit: number;
  gear: { blade: number; tank: number; anchor: number };
  status: UnitStatus;
}

// ---- GameState（セーブされるのはこれだけ） ----
import type { BaseState, DayReport } from '../base/types';

export type Phase = 'morning' | 'day' | 'night';

export interface LegacyBonus { kind: string; value: number }            // P5で具体化
export interface RaidWarning { day: number }                            // P4で具体化
export interface ExpeditionState { day: number }                        // P3で具体化
export interface ChapterState { bossDefeated: boolean; wallWork: number } // P5で具体化
export type DayLogEntry = DayReport;

export interface MemorialEntry { captainId: string; name: string; type: CaptainType; day: number; legacy: LegacyBonus }

export interface GameState {
  version: 1;
  seed: number;
  day: number;
  phase: Phase;
  chapter: number;
  resources: Resources;
  civilians: number;
  morale: number;
  base: BaseState;
  captains: Captain[];
  soldiers: Soldier[];
  squads: Squad[];
  hero: Hero;
  memorial: MemorialEntry[];
  expedition: ExpeditionState | null;
  raidWarning: RaidWarning | null;
  log: DayLogEntry[];
  trainingQueue: number;
  lastRaidDay: number;
  chapterState: ChapterState;
}
