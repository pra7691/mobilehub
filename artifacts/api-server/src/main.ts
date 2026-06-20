import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(helmet());

  // ── Request ID ────────────────────────────────────────────────────────────
  const rid = new RequestIdMiddleware();
  app.use(rid.use.bind(rid));

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : true; // dev: allow all

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  app.setGlobalPrefix('api');

  // ── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // ── Exception filter ──────────────────────────────────────────────────────
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = process.env.PORT || 5000;
  await app.listen(port);
  logger.log(`Capto API running on port ${port}`);
}

bootstrap();
