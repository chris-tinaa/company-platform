import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import { AuthRepository } from '../database/auth.repository';
import type { EmployeeEventType } from './lifecycle-policy';

export type EmployeeLifecycleEvent = {
  id: string;
  type: EmployeeEventType;
  employeeId: string;
  employeeNumber: string;
  version: number;
  sessionGeneration?: number;
  occurredAt: string;
};

@Injectable()
export class LifecycleConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(LifecycleConsumer.name);
  private connection: Awaited<ReturnType<typeof connect>> | null = null;
  private channel: ConfirmChannel | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopping = false;

  constructor(private readonly users: AuthRepository) { }

  onModuleInit(): void {
    void this.connectBroker();
  }

  private async connectBroker(): Promise<void> {
    if (this.stopping) return;
    try {
      const connection = await connect(process.env.RABBITMQ_URL ?? 'amqp://demo_local:demo_local_only@127.0.0.1:5672');
      this.connection = connection;
      connection.on('close', () => {
        this.channel = null;
        this.connection = null;
        if (!this.stopping) this.scheduleReconnect();
      });
      const channel = await connection.createConfirmChannel();
      this.channel = channel;
      await channel.assertExchange('company.employee.events', 'topic', { durable: true });
      await channel.assertQueue('auth.employee.lifecycle', { durable: true });
      await channel.assertQueue('auth.employee.lifecycle.dead', { durable: true });
      await channel.bindQueue('auth.employee.lifecycle', 'company.employee.events', 'employee.created');
      await channel.bindQueue('auth.employee.lifecycle', 'company.employee.events', 'employee.deactivated');
      await channel.bindQueue('auth.employee.lifecycle', 'company.employee.events', 'employee.reactivated');
      await channel.prefetch(1);
      await channel.consume('auth.employee.lifecycle', (message) => {
        if (message) void this.processMessage(channel, message);
      }, { noAck: false });
      this.log.log('RabbitMQ consumer terhubung');
    } catch (error) {
      this.log.warn(`Koneksi RabbitMQ tertunda: ${error instanceof Error ? error.name : 'unknown'}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopping) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectBroker();
    }, 5000);
  }

  private decode(message: ConsumeMessage): EmployeeLifecycleEvent {
    const parsed: unknown = JSON.parse(message.content.toString('utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('Event tidak valid');
    const data = parsed as Record<string, unknown>;
    if (typeof data.id !== 'string' || typeof data.employeeId !== 'string' ||
      typeof data.employeeNumber !== 'string' || typeof data.occurredAt !== 'string' ||
      typeof data.version !== 'number' || !Number.isSafeInteger(data.version) ||
      !['employee.created', 'employee.deactivated', 'employee.reactivated'].includes(String(data.type)) ||
      (data.sessionGeneration !== undefined &&
        (typeof data.sessionGeneration !== 'number' || !Number.isSafeInteger(data.sessionGeneration) || data.sessionGeneration < 1)) ||
      (data.type === 'employee.reactivated' && data.sessionGeneration === undefined)) {
      throw new Error('Struktur event tidak valid');
    }
    return {
      id: data.id as string,
      type: data.type as EmployeeEventType,
      employeeId: data.employeeId as string,
      employeeNumber: data.employeeNumber as string,
      version: data.version,
      sessionGeneration: data.sessionGeneration as number | undefined,
      occurredAt: data.occurredAt as string,
    };
  }

  private async moveToQueue(channel: ConfirmChannel, message: ConsumeMessage, destination: string, attempts: number): Promise<void> {
    channel.sendToQueue(destination, message.content, { persistent: true, headers: { attempts } });
    await channel.waitForConfirms();
    channel.ack(message);
  }

  private async processMessage(channel: ConfirmChannel, message: ConsumeMessage): Promise<void> {
    let event: EmployeeLifecycleEvent;
    try {
      event = this.decode(message);
    } catch {
      try {
        await this.moveToQueue(channel, message, 'auth.employee.lifecycle.dead', 3);
      } catch {
        this.log.error('Event tidak valid gagal dipindahkan ke dead queue');
      }
      return;
    }
    try {
      await this.users.applyLifecycleEvent(event);
      channel.ack(message);
    } catch (error) {
      const attempts = Number(message.properties.headers?.attempts ?? 0);
      this.log.warn(`Proses event gagal: ${event.id}, percobaan ${attempts + 1}`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(2000, 500 * (2 ** attempts))));
      try {
        const destination = attempts >= 2 ? 'auth.employee.lifecycle.dead' : 'auth.employee.lifecycle';
        await this.moveToQueue(channel, message, destination, attempts + 1);
      } catch {
        this.log.error('Publikasi retry gagal, message belum ACK');
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { await this.channel?.close(); } catch { this.log.warn('Channel telah ditutup'); }
    try { await this.connection?.close(); } catch { this.log.warn('Koneksi telah ditutup'); }
  }
}
