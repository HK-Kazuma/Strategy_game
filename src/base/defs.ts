import type { BuildingDef, BuildingType } from './types';

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  hq:         { type: 'hq', name: '司令部', w: 3, h: 3, cost: {}, buildDays: 0, maxWorkers: 0, unique: true, needsAdjacent: null },
  house:      { type: 'house', name: '住居', w: 2, h: 2, cost: { wood: 20 }, buildDays: 1, maxWorkers: 0, unique: false, needsAdjacent: null },
  farm:       { type: 'farm', name: '畑', w: 2, h: 2, cost: { wood: 15 }, buildDays: 1, maxWorkers: 3, unique: false, needsAdjacent: null },
  lumber:     { type: 'lumber', name: '伐採所', w: 2, h: 2, cost: { wood: 10 }, buildDays: 1, maxWorkers: 3, unique: false, needsAdjacent: 'forest' },
  workshop:   { type: 'workshop', name: '工房', w: 2, h: 2, cost: { wood: 30, iron: 5 }, buildDays: 2, maxWorkers: 2, unique: false, needsAdjacent: null },
  training:   { type: 'training', name: '訓練所', w: 2, h: 2, cost: { wood: 25 }, buildDays: 2, maxWorkers: 1, unique: false, needsAdjacent: null },
  infirmary:  { type: 'infirmary', name: '医療所', w: 2, h: 2, cost: { wood: 25, iron: 5 }, buildDays: 2, maxWorkers: 1, unique: false, needsAdjacent: null },
  watchtower: { type: 'watchtower', name: '見張り塔', w: 1, h: 1, cost: { wood: 15, stone: 10 }, buildDays: 1, maxWorkers: 1, unique: false, needsAdjacent: null },
};

export const BUILDABLE: BuildingType[] = ['house', 'farm', 'lumber', 'workshop', 'training', 'infirmary', 'watchtower'];
