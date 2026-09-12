import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Product } from '../catalog/entities/product.entity';
import { ProductVariant } from '../catalog/entities/product-variant.entity';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchResultDto } from './dto/search-result.dto';
import { ProductHitDto, VariantHitDto } from './dto/search-hit.dto';
import { SearchType } from './enums/search-type.enum';

const SIMILARITY_THRESHOLD = 0.1;

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
  ) {}

  async search(
    tenantId: string,
    dto: SearchQueryDto,
  ): Promise<SearchResultDto> {
    const limit = dto.limit ?? 10;
    const result: SearchResultDto = { type: dto.type ?? SearchType.ALL };

    if (dto.type === SearchType.ALL || dto.type === SearchType.PRODUCT) {
      result.products = await this.searchProducts(tenantId, dto, limit);
    }

    if (dto.type === SearchType.ALL || dto.type === SearchType.VARIANT) {
      result.variants = await this.searchVariants(tenantId, dto, limit);
    }

    return result;
  }

  private async searchProducts(
    tenantId: string,
    dto: SearchQueryDto,
    limit: number,
  ): Promise<ProductHitDto[]> {
    const qb = this.productRepo
      .createQueryBuilder('p')
      .addSelect('similarity(p.name, :q)', 'score')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.deleted_at IS NULL')
      .andWhere('similarity(p.name, :q) > :threshold', {
        q: dto.q,
        threshold: SIMILARITY_THRESHOLD,
      })
      .orderBy('score', 'DESC')
      .take(limit);

    if (dto.categoryId) {
      qb.andWhere('p.category_id = :categoryId', {
        categoryId: dto.categoryId,
      });
    }

    const { entities, raw } = await qb.getRawAndEntities<{
      p_id: string;
      score: string;
    }>();
    const scoreById = new Map<string, number>(
      raw.map((row) => [String(row.p_id), Number(row.score)]),
    );

    return entities.map((product) => ({
      score: scoreById.get(product.id) ?? 0,
      product,
    }));
  }

  private async searchVariants(
    tenantId: string,
    dto: SearchQueryDto,
    limit: number,
  ): Promise<VariantHitDto[]> {
    const { entities, raw } = await this.variantRepo
      .createQueryBuilder('v')
      .addSelect('similarity(v.sku, :q)', 'score')
      .where('v.tenant_id = :tenantId', { tenantId })
      .andWhere('v.deleted_at IS NULL')
      .andWhere('similarity(v.sku, :q) > :threshold', {
        q: dto.q,
        threshold: SIMILARITY_THRESHOLD,
      })
      .orderBy('score', 'DESC')
      .take(limit)
      .getRawAndEntities<{
        v_id: string;
        score: string;
      }>();

    const scoreById = new Map<string, number>(
      raw.map((row) => [String(row.v_id), Number(row.score)]),
    );

    return entities.map((variant) => ({
      score: scoreById.get(variant.id) ?? 0,
      variant,
    }));
  }
}
