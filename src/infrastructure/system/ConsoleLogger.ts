import { Logger } from '../../application/ports/services';

export class ConsoleLogger implements Logger {
  /** quiet = true silencia info/warn (útil en las pruebas). */
  constructor(private readonly quiet = false) {}

  info(message: string, context?: Record<string, unknown>): void {
    if (!this.quiet) console.log(this.format('INFO', message, context));
  }
  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.quiet) console.warn(this.format('WARN', message, context));
  }
  error(message: string, context?: Record<string, unknown>): void {
    console.error(this.format('ERROR', message, context));
  }
  private format(level: string, message: string, context?: Record<string, unknown>): string {
    const extra = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
    return `${new Date().toISOString()} [${level}] ${message}${extra}`;
  }
}
