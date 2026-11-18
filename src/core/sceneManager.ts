export interface GameScene<P, R> {
  enter(params: P, done: (result: R) => void): void;
  update(dt: number): void;
  render(alpha: number): void;
  exit(): void;
}

export type SceneId = 'base' | 'expeditionMap' | 'combat' | 'raid' | 'report';

export class SceneManager {
  current: GameScene<any, any> | null = null;

  go<P, R>(scene: GameScene<P, R>, params: P, done: (result: R) => void): void {
    this.current?.exit();
    this.current = scene;
    scene.enter(params, done);
  }
  update(dt: number): void { this.current?.update(dt); }
  render(alpha: number): void { this.current?.render(alpha); }
}
