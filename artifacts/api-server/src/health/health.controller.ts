import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get('healthz')
  async healthCheck() {
    const db = await this.prisma.$queryRaw`SELECT 1`
      .then(() => 'ok')
      .catch(() => 'error');

    const status = db === 'ok' ? 'ok' : 'degraded';
    return {
      status,
      timestamp: new Date().toISOString(),
      checks: { database: db },
      version: process.env.npm_package_version ?? '0.0.0',
    };
  }

  @Get('readyz')
  async readiness() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ready: true };
  }
}
