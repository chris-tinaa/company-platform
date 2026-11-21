import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  // Documentation is intentionally never published in production.
  if (process.env.SWAGGER_ENABLED === 'true' && process.env.APP_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Company Platform - Auth Service')
      .setDescription('Local API reference. Cookie session required for protected endpoints. Unsafe writes require Origin and X-Requested-With: attendance-portal; Swagger UI is for documentation.')
      .setVersion('1.0')
      .addCookieAuth('access_token')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('swagger', app, document, {
      swaggerOptions: { supportedSubmitMethods: ['get'], persistAuthorization: false },
    });
  }
  const port = Number(process.env.SERVICE_PORT ?? process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT tidak valid');
  await app.listen(port, '127.0.0.1');
}

void bootstrap();
