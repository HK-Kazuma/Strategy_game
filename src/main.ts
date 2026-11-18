import { InputManager } from './core/input';
import { SceneManager } from './core/sceneManager';
import { startLoop } from './core/loop';
import { createRenderer } from './render/renderer';
import { CombatScene } from './combat/scene';
import { createPrototypeSetup } from './combat/stage';

const app = document.getElementById('app')!;
const r3 = createRenderer(app);
const input = new InputManager(r3.renderer.domElement);
const manager = new SceneManager();

// P1：戦闘プロトタイプ。終わったらシードを変えてもう一度
let run = 0;
function startCombat(): void {
  run += 1;
  const seed = Number(new URLSearchParams(location.search).get('seed') ?? run);
  manager.go(new CombatScene(r3, input, app), createPrototypeSetup(seed), () => startCombat());
}
startCombat();

startLoop(
  (dt) => manager.update(dt),
  (a) => manager.render(a),
  () => input.endTick(),
);
