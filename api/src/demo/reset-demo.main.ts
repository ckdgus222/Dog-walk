import { setTimeout } from 'node:timers/promises';
import { PrismaService } from '../prisma/prisma.service.js';
import { resetDemo } from './reset-demo.js';

async function main() {
  const prisma = new PrismaService();
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const counts = await resetDemo(prisma);
        console.log(JSON.stringify(counts));
        return;
      } catch (error) {
        if (attempt === 3) throw error;
        await setTimeout(1000);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main().catch((error: unknown) => {
  console.error('Demo reset failed:', error);
  process.exitCode = 1;
});
