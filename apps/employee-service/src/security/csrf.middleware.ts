import {
  ForbiddenException,
  Injectable,
  type NestMiddleware,
} from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    const unsafe = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
    if (!unsafe || request.originalUrl.startsWith("/internal/")) {
      next();
      return;
    }
    if (
      request.headers.origin !==
        (process.env.APP_ORIGIN ?? "http://localhost:5173") ||
      request.headers["x-requested-with"] !== "attendance-portal"
    ) {
      throw new ForbiddenException(
        "Permintaan berasal dari sumber tidak diizinkan",
      );
    }
    next();
  }
}
