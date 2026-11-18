// 型付きイベントバス
export class EventBus<E extends { kind: string }> {
  private handlers: ((e: E) => void)[] = [];
  on(h: (e: E) => void): () => void {
    this.handlers.push(h);
    return () => { this.handlers = this.handlers.filter((x) => x !== h); };
  }
  emit(e: E): void { for (const h of this.handlers) h(e); }
}
