import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { Request } from 'express';

/**
 * Parses a postgres DATABASE_URL and returns only the host, database name,
 * and a derived label — credentials are never included in the output.
 *
 * Heuristic for label: if the hostname or database name contains "prod"
 * the database is labelled "production"; otherwise "development".
 */
function parseDbUrl(url: string | undefined): {
  host: string;
  name: string;
  label: 'development' | 'production';
} {
  if (!url) return { host: 'unknown', name: 'unknown', label: 'development' };
  try {
    const u = new URL(url);
    const host = u.hostname;
    // pathname is /<dbname>[?params] — strip leading slash and query string
    const name = u.pathname.replace(/^\//, '').split('?')[0] || 'unknown';
    const isProd =
      /prod/i.test(host) || /prod/i.test(name) || /prod/i.test(url);
    return { host, name, label: isProd ? 'production' : 'development' };
  } catch {
    return { host: 'unknown', name: 'unknown', label: 'development' };
  }
}

@Controller('diagnostics')
@UseGuards(AdminJwtGuard)
export class DiagnosticsController {
  /**
   * Returns safe environment metadata for admin diagnostics.
   * Never includes credentials, secrets, or full connection strings.
   *
   * Protected: admin JWT required.
   */
  @Get('environment')
  environment(@Req() req: Request) {
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const environment: 'development' | 'production' =
      nodeEnv === 'production' ? 'production' : 'development';

    // Prefer X-Forwarded-Host (set by Replit proxy) over the raw Host header
    const apiHost =
      ((req.headers['x-forwarded-host'] as string) || '').split(',')[0].trim() ||
      (req.headers['host'] as string) ||
      'unknown';

    const db = parseDbUrl(process.env.DATABASE_URL);

    // Replit sets REPL_ID on all repls; REPLIT_DEPLOYMENT_ID only for deployments
    const deploymentId =
      process.env.REPLIT_DEPLOYMENT_ID ?? process.env.REPL_ID ?? null;

    return {
      environment,
      apiHost,
      dbLabel: db.label,
      dbHost: db.host,
      dbName: db.name,
      apiVersion: process.env.npm_package_version ?? '0.0.0',
      deploymentId,
    };
  }
}
