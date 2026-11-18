import { BUILDABLE, BUILDING_DEFS } from './defs';
import { levelUpCost, canAfford } from './actions';
import { maxWorkersOf, totalWorkers, headcount, housingCap, residents } from './economy';
import type { GameState, Resources } from '../state/types';
import type { Building, BuildingType, DayReport } from './types';

export type UiAction = (act: string, arg?: string) => void;

const RES_LABEL: Record<keyof Resources, string> = {
  wood: '木材', stone: '石材', food: '食料', ironOre: '鉄鉱石', crystal: '蒼晶石', iron: '鉄', gas: 'ガス', blades: '刃',
};
const PHASE_LABEL = { morning: '朝', day: '昼', night: '夜' } as const;
const STATUS_LABEL = (b: Building) =>
  b.status.kind === 'active' ? '稼働中' : b.status.kind === 'constructing' ? `建設中（あと${b.status.daysLeft}日）` : '損傷';

const costText = (c: Partial<Resources>) =>
  (Object.keys(c) as (keyof Resources)[]).map((k) => `${RES_LABEL[k]}${c[k]}`).join(' ') || '無料';

export interface UiContext {
  selected: Building | null;
  placing: BuildingType | null;
  message: string;
  debug: boolean;
}

export class BaseUi {
  private top = document.createElement('div');
  private left = document.createElement('div');
  private right = document.createElement('div');
  private bottom = document.createElement('div');
  private toast = document.createElement('div');
  private modal: HTMLElement | null = null;
  private root = document.createElement('div');

  constructor(private host: HTMLElement, private act: UiAction) {
    this.root.className = 'base-ui';
    this.top.className = 'b-top'; this.left.className = 'b-left'; this.right.className = 'b-right';
    this.bottom.className = 'b-bottom'; this.toast.className = 'b-toast';
    this.root.append(this.top, this.left, this.right, this.bottom, this.toast);
    host.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (el && !el.hasAttribute('disabled')) this.act(el.dataset.act!, el.dataset.arg);
    });
    this.root.addEventListener('change', (e) => {
      const el = e.target as HTMLSelectElement;
      if (el.dataset.act) this.act(el.dataset.act, el.value);
    });
  }

  refresh(s: GameState, ctx: UiContext): void {
    const morning = s.phase === 'morning';
    const res = (Object.keys(RES_LABEL) as (keyof Resources)[])
      .map((k) => `<span>${RES_LABEL[k]} <b>${Math.floor(s.resources[k])}</b></span>`).join('');
    const w = s.base.wall;
    this.top.innerHTML = `
      <span class="day">${s.day}日目 ${PHASE_LABEL[s.phase]}</span>${res}
      <span>住民 <b>${totalWorkers(s)}/${s.civilians}</b></span>
      <span>兵士 <b>${s.soldiers.length + s.captains.length}</b></span>
      <span>収容 <b>${residents(s)}/${housingCap(s)}</b></span>
      <span>食べる人数 <b>${headcount(s)}</b></span>
      <span>士気 <b>${s.morale}</b></span>
      <span>壁 <b>${Math.floor(w.hp)}/${w.hpMax}</b></span>`;

    const buttons = BUILDABLE.map((t) => {
      const d = BUILDING_DEFS[t];
      const dis = !morning || !canAfford(s, d.cost) ? 'disabled' : '';
      return `<button data-act="build" data-arg="${t}" ${dis} class="${ctx.placing === t ? 'on' : ''}">${d.name}<small>${costText(d.cost)}</small></button>`;
    }).join('');
    const repairNeed = w.hp < w.hpMax && morning && s.resources.wood > 0;
    this.left.innerHTML = `
      <h4>建築${morning ? '' : '（朝のみ）'}</h4>${buttons}
      <h4>訓練の予約</h4>
      <div class="row"><button data-act="train" data-arg="-1" ${morning ? '' : 'disabled'}>−</button><b>${s.trainingQueue}</b><button data-act="train" data-arg="1" ${morning ? '' : 'disabled'}>＋</button></div>
      <h4>壁の修理</h4>
      <button data-act="repair" ${repairNeed ? '' : 'disabled'}>木材10で修理<small>耐久+${10 * 2}</small></button>
      <h4>データ</h4>
      <button data-act="newgame">新規ゲーム</button>
      ${ctx.debug ? `<h4>デバッグ</h4><button data-act="dbg-res">資源+100</button><button data-act="dbg-ore">鉄鉱石・蒼晶石+20</button><button data-act="dbg-day">1日進める</button><button data-act="dbg-10">10日進める</button>` : ''}`;

    this.right.innerHTML = ctx.selected ? this.buildingPanel(s, ctx.selected, morning) : '';
    this.bottom.innerHTML = `<button class="next" data-act="next">${s.phase === 'morning' ? '昼へ' : s.phase === 'day' ? '夜へ' : '朝へ（日報）'} ▶</button>`;
    this.toast.textContent = ctx.message;
    this.toast.style.opacity = ctx.message ? '1' : '0';
  }

  private buildingPanel(s: GameState, b: Building, morning: boolean): string {
    const d = BUILDING_DEFS[b.type];
    const max = maxWorkersOf(b);
    const workers = max > 0
      ? `<div class="row">労働者 <button data-act="w" data-arg="-1" ${morning ? '' : 'disabled'}>−</button><b>${b.workers}/${max}</b><button data-act="w" data-arg="1" ${morning ? '' : 'disabled'}>＋</button></div>`
      : '';
    const recipe = b.type === 'workshop'
      ? `<div class="row">生産 <select data-act="recipe"><option value="blades" ${b.recipe === 'blades' ? 'selected' : ''}>刃（鉄1→刃4）</option><option value="gas" ${b.recipe === 'gas' ? 'selected' : ''}>ガス（蒼晶石1→ガス10）</option></select></div>`
      : '';
    const lvCost = levelUpCost(s, b);
    const lv = `<button data-act="levelup" ${morning && canAfford(s, lvCost) ? '' : 'disabled'}>強化 Lv${b.level + 1}<small>${costText(lvCost)}</small></button>`;
    const mv = b.type === 'hq' ? '' : `<button data-act="move" ${morning ? '' : 'disabled'}>移動</button><button data-act="demolish" ${morning ? '' : 'disabled'}>解体</button>`;
    return `<h4>${d.name} Lv${b.level}</h4><div>${STATUS_LABEL(b)}</div>${workers}${recipe}${lv}${mv}<button data-act="deselect">閉じる</button>`;
  }

  showReport(r: DayReport, onClose: () => void): void {
    this.modal?.remove();
    const list = (o: Partial<Resources>) => (Object.keys(o) as (keyof Resources)[]).filter((k) => o[k]).map((k) => `${RES_LABEL[k]}${o[k]}`).join('、') || 'なし';
    const na = r.nightAttack;
    const m = document.createElement('div');
    m.className = 'b-modal';
    m.innerHTML = `
      <div class="card">
        <h3>${r.day}日目の日報</h3>
        <p>生産：${list(r.produced)}</p>
        <p>消費：${list(r.consumed)}</p>
        <p>住民 ${r.civiliansDelta >= 0 ? '+' : ''}${r.civiliansDelta} ／ 士気 ${r.moraleDelta >= 0 ? '+' : ''}${r.moraleDelta}</p>
        ${r.recovered.length ? `<p>療養が終わった：${r.recovered.join('、')}</p>` : ''}
        ${na?.happened ? `<p class="warn">夜襲！ 強さ${na.power} / 防御${na.defense} → 壁に${na.wallDamage}ダメージ</p>` : ''}
        ${r.notes.map((n) => `<p class="warn">${n}</p>`).join('')}
        <button>閉じる</button>
      </div>`;
    m.querySelector('button')!.addEventListener('click', () => { m.remove(); this.modal = null; onClose(); });
    this.host.appendChild(m);
    this.modal = m;
  }

  dispose(): void { this.root.remove(); this.modal?.remove(); }
}
