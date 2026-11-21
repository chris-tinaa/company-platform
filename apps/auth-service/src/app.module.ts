import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthController, InternalAuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AuthRepository } from "./database/auth.repository";
import { CsrfMiddleware } from "./security/csrf.middleware";
import { LifecycleConsumer } from "./lifecycle/lifecycle.consumer";

@Module({
  controllers: [HealthController, AuthController, InternalAuthController],
  providers: [AuthService, AuthRepository, LifecycleConsumer],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfMiddleware).forRoutes("*");
  }
}