import { UserRepository } from '../ports/repositories';

/** Resuelve nombres públicos de usuarios (sin datos de contacto, RN-23). */
export async function resolveUserNames(users: UserRepository, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const found = await users.findManyByIds(unique);
  return new Map(found.map((u) => [u.id, u.name]));
}
