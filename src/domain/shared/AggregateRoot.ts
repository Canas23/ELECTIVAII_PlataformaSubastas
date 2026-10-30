export abstract class AggregateRoot<TEvent> {
  private pendingEvents: TEvent[] = [];

  protected record(event: TEvent): void {
    this.pendingEvents.push(event);
  }

  pullDomainEvents(): TEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }
}
