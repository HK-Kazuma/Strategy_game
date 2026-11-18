import { COMBAT as C } from '../config/combat';
import type { CombatResult, CombatWorld } from './types';

const ORDER_LABEL = { free: '自由戦闘', gather: '集結', retreat: '撤退', charge: '一斉突撃！' } as const;
const OUTCOME_LABEL = { victory: '勝利', retreat: '撤退', heroDown: '主人公、戦闘不能' } as const;

export class CombatHud {
  private root = document.createElement('div');
  private hp!: HTMLElement; private gas!: HTMLElement; private blade!: HTMLElement;
  private sup!: HTMLElement; private order!: HTMLElement; private goal!: HTMLElement; private hint!: HTMLElement;
  private overlay: HTMLElement | null = null;

  constructor(private host: HTMLElement) {
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="bar"><span>HP</span><i><b id="hud-hp"></b></i></div>
        <div class="bar"><span>ガス</span><i><b id="hud-gas" class="gas"></b></i></div>
        <div class="bar"><span>必殺</span><i><b id="hud-sup" class="sup"></b></i></div>
        <div id="hud-blade" class="blade"></div>
      </div>
      <div class="hud-tr"><div id="hud-goal"></div><div id="hud-order"></div></div>
      <div class="hud-bl">WASD 移動 / 左クリック 斬撃 / 右クリック アンカー / Space 回避 / R 刃交換 / Q 必殺 / 1 自由 2 集結 3 撤退</div>
      <div id="hud-hint" class="hint"></div>`;
    host.appendChild(this.root);
    const q = (id: string) => this.root.querySelector(`#${id}`) as HTMLElement;
    this.hp = q('hud-hp'); this.gas = q('hud-gas'); this.sup = q('hud-sup');
    this.blade = q('hud-blade'); this.order = q('hud-order'); this.goal = q('hud-goal'); this.hint = q('hud-hint');
  }

  update(w: CombatWorld, napeReady: boolean): void {
    const h = w.hero;
    this.hp.style.width = `${Math.max(0, (h.hp / C.heroHp) * 100)}%`;
    this.gas.style.width = `${Math.max(0, (h.gas / w.setup.hero.gas) * 100)}%`;
    this.sup.style.width = `${h.superCharge * 100}%`;
    this.sup.classList.toggle('full', h.superCharge >= 1);
    this.blade.textContent = `刃 ${h.bladeDur}/${C.bladeDurMax}　予備 ${h.spareBlades}`;
    const alive = w.titans.filter((t) => t.state.kind !== 'dying').length;
    this.goal.textContent = `巨人 残り ${alive} 体`;
    this.order.textContent = `号令：${ORDER_LABEL[w.squadOrder]}${w.chargeT > 0 ? ` (${w.chargeT.toFixed(1)})` : ''}`;
    let msg = '';
    if (h.gas < C.gasAnchor) msg = 'ガス不足';
    else if (h.bladeDur <= 0) msg = '刃が折れた！ Rで交換';
    else if (napeReady) msg = 'うなじを狙える！ 巨人を右クリック';
    this.hint.textContent = msg;
  }

  showResult(r: CombatResult, retry: () => void): void {
    this.overlay?.remove();
    const o = document.createElement('div');
    o.className = 'overlay';
    const kills = r.kills.length;
    o.innerHTML = `
      <h2>${OUTCOME_LABEL[r.outcome]}</h2>
      <p>討伐 ${kills} 体（主人公 ${r.kills.filter((k) => k.byHero).length} 体） / 時間 ${r.durationSec.toFixed(1)} 秒</p>
      <p>ガス残 ${r.gasLeft} / 刃残 ${r.bladesLeft}</p>
      <p>重傷の隊員 ${r.injuredSoldierIds.length} 人 / 戦死した隊長 ${r.deadCaptainIds.length} 人</p>
      <button>もう一度</button>`;
    o.querySelector('button')!.addEventListener('click', retry);
    this.host.appendChild(o);
    this.overlay = o;
  }

  dispose(): void { this.root.remove(); this.overlay?.remove(); }
}
