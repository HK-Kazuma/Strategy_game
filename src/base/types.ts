import type { Resources } from '../state/types';

export type Terrain = 'grass' | 'forest' | 'rock' | 'river';
export type BuildingType =
  | 'hq' | 'house' | 'farm' | 'lumber' | 'workshop' | 'training' | 'infirmary'
  | 'watchtower';
export type RecipeId = 'blades' | 'gas';

export type BuildingStatus =
  | { kind: 'active' }
  | { kind: 'constructing'; daysLeft: number }
  | { kind: 'damaged' };

export interface Building {
  id: string; type: BuildingType;
  x: number; z: number;          // 左上のマス
  rot: 0 | 1;
  level: number;
  workers: number;
  recipe: RecipeId | null;
  status: BuildingStatus;
  hp: number; hpMax: number;
}

export interface WallState { stage: number; hp: number; hpMax: number }

/** 当日の昼に出た生産・消費を夜まで持ち越す入れ物 */
export interface TodayAcc {
  produced: Partial<Resources>;
  consumed: Partial<Resources>;
  notes: string[];
  civiliansStart: number;
  moraleStart: number;
}

export interface BaseState {
  size: 40;
  terrain: Terrain[];            // index = z * 40 + x
  wall: WallState;
  buildings: Building[];
  nextBuildingNo: number;
  hungerStreak: number;
  beds: string[];
  today: TodayAcc;
}

export interface BuildingDef {
  type: BuildingType; name: string;
  w: number; h: number;
  cost: Partial<Resources>; buildDays: number;
  maxWorkers: number;
  unique: boolean;
  needsAdjacent: Terrain | null;
}

export interface DayReport {
  day: number;
  produced: Partial<Resources>; consumed: Partial<Resources>;
  civiliansDelta: number; moraleDelta: number;
  recovered: string[];
  nightAttack: { happened: boolean; power: number; defense: number; wallDamage: number } | null;
  notes: string[];
}

export type PlaceCheck =
  | { ok: true }
  | { ok: false; reason: 'outsideWall' | 'overlap' | 'terrain' | 'needsAdjacent' | 'unique' };

export type PhaseEvent = { kind: 'nightAttack' } | { kind: 'raidWarning' } | { kind: 'raidStart' } | { kind: 'wallBroken' };
