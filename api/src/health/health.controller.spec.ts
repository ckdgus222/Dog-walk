import { ServiceUnavailableException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let module: TestingModule;
  let controller: HealthController;
  const queryRaw = vi.fn();

  beforeEach(async () => {
    queryRaw.mockReset();
    module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();
    controller = module.get(HealthController);
  });

  afterEach(async () => {
    await module.close();
  });

  it('returns the healthy status after SELECT 1 succeeds', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      db: 'up',
    });
    expect(queryRaw).toHaveBeenCalledExactlyOnceWith(['SELECT 1']);
  });

  it('returns 503 without exposing the database error', async () => {
    queryRaw.mockRejectedValue(
      new Error('private database connection details'),
    );

    const error: unknown = await controller
      .check()
      .catch((error: unknown) => error);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      status: 'error',
      db: 'down',
    });
  });

  it('checks the database again after a failure', async () => {
    queryRaw.mockRejectedValueOnce(new Error('database unavailable'));
    queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      db: 'up',
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
