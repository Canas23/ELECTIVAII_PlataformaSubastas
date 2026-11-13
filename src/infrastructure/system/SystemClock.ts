import { Clock } from '../../application/ports/services';

/**
 * Reloj del sistema. Admite un desfase para las demostraciones
 * (DEV_CLOCK_ENABLED): el dominio no se entera, solo recibe otra hora.
 */
export class SystemClock implements Clock {
  private offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  advance(minutes: number): void {
    this.offsetMs += minutes * 60_000;
  }

  reset(): void {
    this.offsetMs = 0;
  }

  get offsetMinutes(): number {
    return this.offsetMs / 60_000;
  }
}
