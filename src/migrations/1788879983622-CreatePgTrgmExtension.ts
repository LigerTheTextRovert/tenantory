import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePgTrgmExtension1788879983622 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    await queryRunner.query(
      'CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);',
    );
    await queryRunner.query(
      'CREATE INDEX idx_product_variants_sku_trgm ON product_variants USING gin (sku gin_trgm_ops);',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_products_name_trgm;');
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_product_variants_sku_trgm;',
    );
    await queryRunner.query('DROP EXTENSION IF EXISTS pg_trgm;');
  }
}
