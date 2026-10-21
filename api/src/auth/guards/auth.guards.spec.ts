import {
  type ExecutionContext,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { JsonBodyGuard } from './json-body.guard.js';

describe('Auth guards', () => {
  it.each([
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain',
    undefined,
  ])('rejects %s before authentication', (contentType) => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ is: (type: string) => type === contentType }),
      }),
    } as unknown as ExecutionContext;
    expect(() => new JsonBodyGuard().canActivate(context)).toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('accepts JSON', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          is: (type: string) => type === 'application/json',
        }),
      }),
    } as unknown as ExecutionContext;
    expect(new JsonBodyGuard().canActivate(context)).toBe(true);
  });
});
