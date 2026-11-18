import { InputManager } from './core/input';
import { SceneManager } from './core/sceneManager';
import { startLoop } from './core/loop';
import { createRenderer } from './render/renderer';
import { CombatScene } from './combat/scene';
import { createPrototypeSetup } from './combat/stage';
import { BaseScene } from './base/scene';
import { createNewGame } from './state/initial';
import { loadGame, saveGame } from './state/save';

const app = document.getElementById('app')!;
const r3 = createRenderer(app);
const input = new InputManager(r3.renderer.domElement);
const manager = new SceneManager();
const params = new URLSearchParams(location.search);

// ?p=1 で戦闘プロトタイプ（P1）、既定は拠点プロトタイプ（P2）
if (params.get('p') === '1') {
  let run = 0;
  const startCombat = (): void => {
    run += 1;
    const seed = Number(params.get('seed') ?? run);
    manager.go(new CombatScene(r3, input, app), createPrototypeSetup(seed), () => startCombat());
  };
  startCombat();
} else {
  const state = (params.has('new') ? null : loadGame()) ?? createNewGame(Number(params.get('seed') ?? Date.now() % 1e9));
  saveGame(state);
  manager.go(new BaseScene(r3, app), state, () => { /* P5で使う */ });
}

startLoop(
  (dt) => manager.update(dt),
  (a) => manager.render(a),
  () => input.endTick(),
);
