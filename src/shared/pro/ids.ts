import type { UUID } from '../gen/common_pb';

export function uuidOf(u: UUID | undefined): string {
  return u?.string ?? '';
}

export const newUuid = (): UUID => ({ $typeName: 'vessel.format.UUID', string: crypto.randomUUID().toUpperCase() });
