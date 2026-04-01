import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = fp(async (server) => {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: config.DATABASE_URL,
      },
    },
  });
  await prisma.$connect();
  
  server.decorate('prisma', prisma);

  server.addHook('onClose', async (server) => {
    await server.prisma.$disconnect();
  });
});

export default prismaPlugin;
