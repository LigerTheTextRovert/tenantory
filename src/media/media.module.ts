import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaAsset } from './entities/media-asset.entity';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
	imports: [TypeOrmModule.forFeature([MediaAsset])],
	controllers: [MediaController],
	providers: [MediaService],
})
export class MediaModule {}
