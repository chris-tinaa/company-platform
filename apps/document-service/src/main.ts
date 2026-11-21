import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  const port = Number(process.env.SERVICE_PORT ?? process.env.PORT ?? 3004);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT tidak valid");
  await app.listen(port, "127.0.0.1");
}

void bootstrap();
