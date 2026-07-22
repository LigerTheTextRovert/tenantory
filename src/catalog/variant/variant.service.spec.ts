import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { VariantService } from './variant.service';
import { ProductVariant } from '../entities/product-variant.entity';
import { Product } from '../entities/product.entity';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PRODUCT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VARIANT_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const mockQueryBuilder = () => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  getExists: jest.fn().mockResolvedValue(false),
});

const mockVariantRepo = () => {
  const qb = mockQueryBuilder();
  return {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    softRemove: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    _qb: qb,
  };
};

const mockProductRepo = () => ({
  findOne: jest.fn(),
});

describe('VariantService', () => {
  let service: VariantService;
  let variantRepo: ReturnType<typeof mockVariantRepo>;
  let productRepo: ReturnType<typeof mockProductRepo>;

  beforeEach(async () => {
    variantRepo = mockVariantRepo();
    productRepo = mockProductRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VariantService,
        { provide: getRepositoryToken(ProductVariant), useValue: variantRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
      ],
    }).compile();

    service = module.get<VariantService>(VariantService);
  });

  describe('create', () => {
    it('should create a variant when product exists and SKU is unique', async () => {
      const dto: CreateVariantDto = {
        sku: 'TSH-BLU-M',
        price: 29.99,
        attributes: { color: 'blue', size: 'M' },
      };

      productRepo.findOne.mockResolvedValue({ id: PRODUCT_ID });

      variantRepo._qb.getExists.mockResolvedValue(false);

      const savedVariant = { id: VARIANT_ID, ...dto, tenantId: TENANT_ID };
      variantRepo.create.mockReturnValue(savedVariant);
      variantRepo.save.mockResolvedValue(savedVariant);

      const result = await service.create(TENANT_ID, PRODUCT_ID, dto);

      expect(result.id).toBe(VARIANT_ID);
      expect(result.sku).toBe('TSH-BLU-M');
      expect(result.price).toBe(29.99);
      expect(variantRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sku: 'TSH-BLU-M',
          price: 29.99,
          attributes: { color: 'blue', size: 'M' },
        }),
      );
      expect(variantRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when product does not exist', async () => {
      const dto: CreateVariantDto = {
        sku: 'TSH-BLU-M',
        price: 29.99,
      };

      productRepo.findOne.mockResolvedValue(null);

      await expect(service.create(TENANT_ID, PRODUCT_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when SKU already exists', async () => {
      const dto: CreateVariantDto = {
        sku: 'TSH-BLU-M',
        price: 29.99,
      };

      productRepo.findOne.mockResolvedValue({ id: PRODUCT_ID });

      variantRepo._qb.getExists.mockResolvedValue(true);

      await expect(service.create(TENANT_ID, PRODUCT_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findOne', () => {
    it('should return a variant by ID', async () => {
      const expected = { id: VARIANT_ID, sku: 'TSH-BLU-M', price: 29.99 };
      variantRepo.findOne.mockResolvedValue(expected);

      const result = await service.findOne(TENANT_ID, PRODUCT_ID, VARIANT_ID);

      expect(result).toEqual(expected);
      expect(variantRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: VARIANT_ID,
          tenant: { id: TENANT_ID },
          product: { id: PRODUCT_ID },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          deletedAt: expect.anything(),
        },
      });
    });

    it('should throw NotFoundException when variant does not exist', async () => {
      variantRepo.findOne.mockResolvedValue(null);

      await expect(
        service.findOne(TENANT_ID, PRODUCT_ID, VARIANT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update price successfully', async () => {
      const existing = {
        id: VARIANT_ID,
        sku: 'TSH-BLU-M',
        price: 29.99,
        attributes: { color: 'blue' },
      };
      variantRepo.findOne.mockResolvedValue(existing);

      const dto: UpdateVariantDto = { price: 39.99 };
      const updated = { ...existing, price: 39.99 };
      variantRepo.save.mockResolvedValue(updated);

      const result = await service.update(
        TENANT_ID,
        PRODUCT_ID,
        VARIANT_ID,
        dto,
      );

      expect(result.price).toBe(39.99);
      expect(variantRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ price: 39.99 }),
      );
    });

    it('should throw NotFoundException when variant does not exist', async () => {
      variantRepo.findOne.mockResolvedValue(null);

      const dto: UpdateVariantDto = { price: 39.99 };

      await expect(
        service.update(TENANT_ID, PRODUCT_ID, VARIANT_ID, dto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft-delete a variant', async () => {
      const variant = { id: VARIANT_ID, sku: 'TSH-BLU-M' };
      variantRepo.findOne.mockResolvedValue(variant);
      variantRepo.softRemove.mockResolvedValue(undefined);

      await service.remove(TENANT_ID, PRODUCT_ID, VARIANT_ID);

      expect(variantRepo.softRemove).toHaveBeenCalledWith(variant);
    });

    it('should throw NotFoundException when variant does not exist', async () => {
      variantRepo.findOne.mockResolvedValue(null);

      await expect(
        service.remove(TENANT_ID, PRODUCT_ID, VARIANT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
