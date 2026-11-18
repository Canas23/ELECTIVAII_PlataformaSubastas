import { randomUUID } from 'node:crypto';
import { IdGenerator } from '../../domain/shared/IdGenerator';

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
