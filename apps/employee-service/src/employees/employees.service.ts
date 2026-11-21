import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeRepository } from '../database/employee.repository';
import type { CreateEmployeeDto } from './create-employee.dto';
import type { UpdateEmployeeDto } from './update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly repo: EmployeeRepository) {}

  async list(rawPage: string, rawLimit: string, search: string) {
    const page = Number(rawPage);
    const pageSize = Number(rawLimit);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 || search.length > 120) {
      throw new BadRequestException('Parameter daftar karyawan tidak valid');
    }
    return this.repo.list(page, pageSize, search);
  }

  async get(id: string) {
    const data = await this.repo.findById(id);
    if (!data) throw new NotFoundException('Karyawan tidak ditemukan');
    return data;
  }

  async create(payload: CreateEmployeeDto) {
    return this.repo.create(payload);
  }

  async update(id: string, payload: UpdateEmployeeDto) {
    return this.repo.update(id, payload.version, payload);
  }

  async reactivate(id: string) {
    return this.repo.reactivate(id);
  }

  async deactivate(id: string) {
    return this.repo.deactivate(id);
  }
}
