import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { EmployeeRepository } from "./database/employee.repository";
import { EmployeesService } from "./employees/employees.service";
import {
  EmployeesController,
  InternalEmployeesController,
} from "./employees/employees.controller";
import { CsrfMiddleware } from "./security/csrf.middleware";
import { OutboxPublisher } from "./messaging/outbox.publisher";

@Module({
  controllers: [
    HealthController,
    EmployeesController,
    InternalEmployeesController,
  ],
  providers: [EmployeeRepository, EmployeesService, OutboxPublisher],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfMiddleware).forRoutes("*");
  }
}
