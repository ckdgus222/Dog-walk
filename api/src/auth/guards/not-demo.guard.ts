import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { PublicUser } from '../../users/users.service.js';

export const DEMO_FORBIDDEN = '데모 계정에서는 할 수 없어요.';

// Multer fileFilter for photo routes, which also accept requests without a
// photo. JwtAuthGuard has already set request.user, so a demo upload is
// refused at its first file instead of after the whole body is buffered.
export function rejectDemoUploads(
  request: Request,
  _file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if ((request.user as PublicUser | undefined)?.isDemo) {
    callback(new ForbiddenException(DEMO_FORBIDDEN), false);
    return;
  }
  callback(null, true);
}

@Injectable()
export class NotDemoGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: PublicUser }>();
    if (request.user.isDemo) {
      throw new ForbiddenException(DEMO_FORBIDDEN);
    }
    return true;
  }
}
