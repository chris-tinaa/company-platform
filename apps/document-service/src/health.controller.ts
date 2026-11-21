import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get("live")
  live() {
    return { service: "document", status: "UP" };
  }

  @Get("ready")
  ready() {
    return { service: "document", status: "READY" };
  }
}
