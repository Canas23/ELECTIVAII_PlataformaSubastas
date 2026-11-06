import { AuctionStatusValue } from '../../../domain/auction/AuctionStatus';
import { AuctionSummaryView, toAuctionSummary } from '../../dto/views';
import { AuctionRepository, Page } from '../../ports/repositories';
import { AuctionLifecycle } from '../../services/AuctionLifecycle';

export interface ListAuctionsInput {
  categoryId?: string;
  status?: AuctionStatusValue;
  page: number;
  pageSize: number;
}

/** RF-05: listado con filtros por categoría y estado, paginado. */
export class ListAuctions {
  constructor(
    private readonly auctions: AuctionRepository,
    private readonly lifecycle: AuctionLifecycle,
  ) {}

  async execute(input: ListAuctionsInput): Promise<Page<AuctionSummaryView>> {
    // Cierre perezoso: consultar el listado también evalúa las subastas vencidas
    await this.lifecycle.settleAllDue();
    const page = await this.auctions.list(input);
    return { ...page, items: page.items.map(toAuctionSummary) };
  }
}
