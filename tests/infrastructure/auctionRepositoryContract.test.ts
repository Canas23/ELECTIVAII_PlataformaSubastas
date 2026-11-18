import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { AuctionRepository, UserRepository } from '../../src/application/ports/repositories';
import { Category } from '../../src/domain/category/Category';
import { Email } from '../../src/domain/user/Email';
import { User } from '../../src/domain/user/User';
import {
  InMemoryAuctionRepository,
  InMemoryUserRepository,
} from '../../src/infrastructure/persistence/memory/InMemoryRepositories';
import { SqliteAuctionRepository } from '../../src/infrastructure/persistence/sqlite/SqliteAuctionRepository';
import { openDatabase } from '../../src/infrastructure/persistence/sqlite/SqliteDatabase';
import { SqliteCategoryRepository, SqliteUserRepository } from '../../src/infrastructure/persistence/sqlite/SqliteRepositories';
import { ANA, anOpenAuction, at, HOUR, LUIS, SELLER, SequentialIds, T0 } from '../support/fixtures';

interface Adapter {
  auctions: AuctionRepository;
  users: UserRepository;
  close(): void;
}

const adapters: Record<string, () => Promise<Adapter>> = {
  memoria: async () => ({
    auctions: new InMemoryAuctionRepository(),
    users: new InMemoryUserRepository(),
    close: () => {},
  }),
  sqlite: async () => {
    const db: DatabaseSync = openDatabase(':memory:');
    const users = new SqliteUserRepository(db);
    // Claves foráneas: usuarios y categoría deben existir
    for (const id of [SELLER, ANA, LUIS]) {
      await users.save(User.register({ id, name: id, email: Email.of(`${id}@correo.com`), passwordHash: 'x', now: T0 }));
    }
    const category = Category.restore({ id: 'cat-1', name: 'Pruebas', slug: 'pruebas' });
    await new SqliteCategoryRepository(db).save(category);
    return { auctions: new SqliteAuctionRepository(db), users, close: () => db.close() };
  },
};

for (const [name, create] of Object.entries(adapters)) {
  describe(`AuctionRepository — adaptador ${name}`, () => {
    let adapter: Adapter;
    afterEach(() => adapter?.close());

    it('guarda y recupera el agregado completo sin pérdida', async () => {
      adapter = await create();
      const ids = new SequentialIds();
      const auction = anOpenAuction();
      auction.placeBid({ bidderId: ANA, amount: 100_000 }, at(HOUR), ids);
      auction.placeBid({ bidderId: ANA, amount: 200_000 }, at(HOUR), ids); // rechazada
      auction.placeBid({ bidderId: LUIS, amount: 120_000 }, at(2 * HOUR), ids);
      auction.closeIfDue(at(25 * HOUR), ids);
      await adapter.auctions.save(auction);

      const loaded = await adapter.auctions.findById(auction.id);
      expect(loaded?.toSnapshot()).toEqual(auction.toSnapshot());
      expect((await adapter.auctions.findByPaymentOrderId(auction.order?.id ?? ''))?.id).toBe(auction.id);
    });

    it('guardar de nuevo agrega pujas nuevas sin duplicar las existentes', async () => {
      adapter = await create();
      const ids = new SequentialIds();
      const auction = anOpenAuction();
      auction.placeBid({ bidderId: ANA, amount: 100_000 }, at(HOUR), ids);
      await adapter.auctions.save(auction);
      auction.placeBid({ bidderId: LUIS, amount: 110_000 }, at(2 * HOUR), ids);
      await adapter.auctions.save(auction);
      await adapter.auctions.save(auction);

      const loaded = await adapter.auctions.findById(auction.id);
      expect(loaded?.acceptedBids.map((b) => b.amount.amount)).toEqual([100_000, 110_000]);
    });

    it('filtra, pagina y encuentra subastas pendientes de cierre', async () => {
      adapter = await create();
      const auction = anOpenAuction();
      await adapter.auctions.save(auction);

      expect((await adapter.auctions.list({ status: 'OPEN', page: 1, pageSize: 10 })).total).toBe(1);
      expect((await adapter.auctions.list({ status: 'PAID', page: 1, pageSize: 10 })).total).toBe(0);
      expect((await adapter.auctions.list({ categoryId: 'cat-1', page: 2, pageSize: 10 })).items).toHaveLength(0);
      expect(await adapter.auctions.findIdsPendingSettlement(at(HOUR))).toEqual([]);
      expect(await adapter.auctions.findIdsPendingSettlement(at(24 * HOUR))).toEqual([auction.id]);
    });

    it('consulta por vendedor y por postor', async () => {
      adapter = await create();
      const ids = new SequentialIds();
      const auction = anOpenAuction();
      auction.placeBid({ bidderId: ANA, amount: 100_000 }, at(HOUR), ids);
      await adapter.auctions.save(auction);

      expect((await adapter.auctions.findBySeller(SELLER)).map((a) => a.id)).toEqual([auction.id]);
      expect((await adapter.auctions.findByBidder(ANA)).map((a) => a.id)).toEqual([auction.id]);
      expect(await adapter.auctions.findByBidder(LUIS)).toEqual([]);
    });
  });
}
