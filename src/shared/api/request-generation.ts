// OGE usePagedRead: generation guard адаптирован к жизненному циклу сессии.
// Добавлена отмена HTTP; нет page-number pagination, токенов или клиентских полномочий.
export class RequestGeneration {
  private epoch = 0;
  private controller = new AbortController();
  next() {
    this.controller.abort(); this.controller = new AbortController();
    const current = ++this.epoch;
    return { signal: this.controller.signal, isCurrent: () => current === this.epoch };
  }
  invalidate() { this.epoch++; this.controller.abort(); }
}
