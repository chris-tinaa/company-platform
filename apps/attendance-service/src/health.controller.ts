import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get("live")
  live() {
    return { service: "attendance", status: "UP" };
  }

  @Get("ready")
  ready() {
    return { service: "attendance", status: "READY" };
  }
}
