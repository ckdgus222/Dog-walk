import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export async function convertPhoto(buffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) {
      throw new Error('Unsupported image format');
    }
    return await sharp(buffer)
      .rotate()
      .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
      .webp()
      .toBuffer();
  } catch {
    throw new BadRequestException('jpg, png, webp 사진만 올릴 수 있어요.');
  }
}
