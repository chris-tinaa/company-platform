import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { requireInternalKey, requireUser } from '../security/current-user';
import { EmployeeRepository } from '../database/employee.repository';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './create-employee.dto';
import { UpdateEmployeeDto } from './update-employee.dto';

@Controller('api/v1/employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  async list(@Req() request: Request, @Query('page') page = '1', @Query('pageSize') limit = '20', @Query('search') search = '') {
    await requireUser(request, 'HR');
    return { data: await this.employees.list(page, limit, search), requestId: randomUUID() };
  }

  @Get(':id')
  async get(@Req() request: Request, @Param('id') id: string) {
    await requireUser(request, 'HR');
    return { data: await this.employees.get(id), requestId: randomUUID() };
  }

  @Post()
  async create(@Req() request: Request, @Body() body: CreateEmployeeDto) {
    await requireUser(request, 'HR');
    return { data: await this.employees.create(body), requestId: randomUUID() };
  }

  @Patch(':id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() body: UpdateEmployeeDto) {
    await requireUser(request, 'HR');
    return { data: await this.employees.update(id, body), requestId: randomUUID() };
  }

  @Patch(':id/reactivate')
  async reactivate(@Req() request: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    await requireUser(request, 'HR');
    return { data: await this.employees.reactivate(id), requestId: randomUUID() };
  }

  @Delete(':id')
  async deactivate(@Req() request: Request, @Param('id') id: string) {
    await requireUser(request, 'HR');
    return { data: await this.employees.deactivate(id), requestId: randomUUID() };
  }
}

@Controller('internal/employees')
export class InternalEmployeesController {
  constructor(private readonly repo: EmployeeRepository) {}

  @Get(':id/eligibility')
  async eligibility(@Headers('x-service-key') key: string | undefined, @Param('id') id: string) {
    requireInternalKey(key);
    const employee = await this.repo.findById(id);
    return { data: { eligible: employee?.status === 'ACTIVE', sessionGeneration: employee ? Number(employee.session_generation) : null } };
  }

  @Post('batch')
  async batch(@Headers('x-service-key') key: string | undefined, @Body() body: { employeeIds: string[] }) {
    requireInternalKey(key);
    if (!Array.isArray(body.employeeIds) || body.employeeIds.length > 100 ||
      body.employeeIds.some((id) => typeof id !== 'string' || id.length > 36)) {
      return { data: { items: [] } };
    }
    return { data: { items: await this.repo.names(body.employeeIds) } };
  }
}
