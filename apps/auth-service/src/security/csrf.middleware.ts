import {
  ForbiddenException,
  Injectable,
  type NestMiddleware,
} from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { acceptsUnsafeRequest } from "./security-policy";

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    const unsafe = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
    if (!unsafe || request.originalUrl.startsWith("/internal/")) {
      next();
      return;
    }
    if (
      !acceptsUnsafeRequest(
        request.headers.origin,
        request.headers["x-requested-with"] as string | undefined,
        process.env.APP_ORIGIN ?? "http://localhost:5173",
      )
    )
      throw new ForbiddenException(
        "Permintaan berasal dari sumber tidak diizinkan",
      );
    next();
  }
}

