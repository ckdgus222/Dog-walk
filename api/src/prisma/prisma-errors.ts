import { Prisma } from '../generated/prisma/client.js';

export function isUniqueConstraintError(
  error: unknown,
  field: string,
  index: string,
): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  // Prisma's PostgreSQL adapter reports the constraint index instead of target.
  const adapterError = error.meta?.driverAdapterError as
    | { cause?: { constraint?: { fields?: string[]; index?: string } } }
    | undefined;
  const constraint = adapterError?.cause?.constraint;
  const target = error.meta?.target ?? constraint?.fields ?? constraint?.index;
  return (Array.isArray(target) && target.includes(field)) || target === index;
}

// An update or delete whose where clause matched no row, for example a
// password hash that changed after it was verified.
export function isRecordNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}
