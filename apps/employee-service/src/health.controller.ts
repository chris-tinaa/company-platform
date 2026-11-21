import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get("live")
  live() {
    return { service: "employee", status: "UP" };
  }

  @Get("ready")
  ready() {
    return { service: "employee", status: "READY" };
  }
}
