import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['query', 'warn', 'error'] });

export default prisma;