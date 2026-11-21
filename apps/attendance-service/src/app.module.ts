import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AttendanceRepository } from './attendance/attendance.repository';
import { AttendanceService } from './attendance/attendance.service';
import { AttendanceController } from './attendance/attendance.controller';
import { CsrfMiddleware } from './security/csrf.middleware';
import { ReverseGeocoder } from './location/reverse-geocoder';

@Module({
    controllers: [HealthController, AttendanceController],
    providers: [AttendanceRepository, AttendanceService, { provide: ReverseGeocoder, useFactory: () => new ReverseGeocoder() }],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(CsrfMiddleware).forRoutes('*');
    }
}
