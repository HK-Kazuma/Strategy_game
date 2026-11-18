export const FIXED_DT = 1 / 60;

/** 固定ステップ更新＋可変描画 */
export function startLoop(
  update: (dt: number) => void,
  render: (alpha: number) => void,
  endTick?: () => void,
): void {
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= FIXED_DT) {
      update(FIXED_DT);
      endTick?.();
      acc -= FIXED_DT;
    }
    render(acc / FIXED_DT);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
