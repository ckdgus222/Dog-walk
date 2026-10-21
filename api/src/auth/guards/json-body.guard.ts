import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class JsonBodyGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.is('application/json')) {
      throw new UnsupportedMediaTypeException(
        'Content-Type must be application/json',
      );
    }
    return true;
  }
}
