import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get("live")
  live() {
    return { service: "auth", status: "UP" };
  }

  @Get("ready")
  ready() {
    return { service: "auth", status: "READY" };
  }
}
