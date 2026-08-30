import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Provides the single application PrismaClient (see prisma.service.ts). */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
