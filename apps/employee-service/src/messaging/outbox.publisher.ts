import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { connect, type ConfirmChannel } from "amqplib";
import { EmployeeRepository } from "../database/employee.repository";

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutboxPublisher.name);
  private connection: Awaited<ReturnType<typeof connect>> | null = null;
  private channel: ConfirmChannel | null = null;
  private timer: NodeJS.Timeout | null = null;
  private working = false;

  constructor(private readonly repo: EmployeeRepository) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.publishPending();
    }, 5000);
    void this.publishPending();
  }

  private async openChannel(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    this.connection = await connect(
      process.env.RABBITMQ_URL ??
        "amqp://demo_local:demo_local_only@127.0.0.1:5672",
    );
    this.connection.on("close", () => {
      this.connection = null;
      this.channel = null;
    });
    this.channel = await this.connection.createConfirmChannel();
    await this.channel.assertExchange("company.employee.events", "topic", {
      durable: true,
    });
    return this.channel;
  }

  private async publishPending(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      const pending = await this.repo.pendingEvents();
      if (pending.length === 0) return;
      const channel = await this.openChannel();
      for (const event of pending) {
        const payload =
          typeof event.payload_json === "string"
            ? event.payload_json
            : JSON.stringify(event.payload_json);
        let returned = false;
        const returnedHandler = () => {
          returned = true;
        };
        channel.on("return", returnedHandler);
        try {
          channel.publish(
            "company.employee.events",
            event.event_type,
            Buffer.from(payload),
            { persistent: true, mandatory: true },
          );
          await channel.waitForConfirms();
          if (returned) await this.repo.recordFailure(event.id);
          else await this.repo.markPublished(event.id);
        } finally {
          channel.removeListener("return", returnedHandler);
        }
      }
    } catch (error) {
      this.log.warn(
        `Outbox menunggu pemulihan: ${error instanceof Error ? error.name : "unknown"}`,
      );
    } finally {
      this.working = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    try {
      await this.channel?.close();
    } catch {
      this.log.warn("Channel telah ditutup");
    }
    try {
      await this.connection?.close();
    } catch {
      this.log.warn("Koneksi telah ditutup");
    }
  }
}
