import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { DocumentRepository } from "./database/document.repository";
import { DocumentService } from "./documents/document.service";
import { StorageService } from "./storage/storage.service";
import {
  DocumentController,
  InternalDocumentController,
} from "./documents/document.controller";
import { CsrfMiddleware } from "./security/csrf.middleware";

@Module({
  controllers: [
    HealthController,
    DocumentController,
    InternalDocumentController,
  ],
  providers: [DocumentRepository, DocumentService, StorageService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfMiddleware).forRoutes("*");
  }
}
