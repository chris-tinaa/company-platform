import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { requireUser } from '../security/current-user';
import { EmployeeRepository } from '../database/employee.repository';
import { CreateDepartmentDto, CreatePositionDto, UpdateDepartmentDto, UpdatePositionDto } from './master.dto';

@ApiTags('Departments')
@ApiCookieAuth('access_token')
@Controller('api/v1/departments')
export class DepartmentsController {
  constructor(private readonly employees: EmployeeRepository) {}

  @Get()
  @ApiOperation({ summary: 'List departments (HR only; includes inactive for administration)' })
  async list(@Req() request: Request) {
    await requireUser(request, 'HR');
    return { data: await this.employees.listDepartments(), requestId: randomUUID() };
  }

  @Post()
  @ApiOperation({ summary: 'Create department (HR only)' })
  async create(@Req() request: Request, @Body() input: CreateDepartmentDto) {
    await requireUser(request, 'HR');
    return { data: await this.employees.createDepartment(input.code, input.name), requestId: randomUUID() };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update or deactivate department (HR only)' })
  async update(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateDepartmentDto) {
    await requireUser(request, 'HR');
    return { data: await this.employees.updateDepartment(id, input), requestId: randomUUID() };
  }
}

@ApiTags('Positions')
@ApiCookieAuth('access_token')
@Controller('api/v1/positions')
export class PositionsController {
  constructor(private readonly employees: EmployeeRepository) {}

  @Get()
  @ApiOperation({ summary: 'List positions and level (HR only; includes inactive)' })
  async list(@Req() request: Request) {
    await requireUser(request, 'HR');
    return { data: await this.employees.listPositions(), requestId: randomUUID() };
  }

  @Post()
  @ApiOperation({ summary: 'Create position with level 1-20 (HR only)' })
  async create(@Req() request: Request, @Body() input: CreatePositionDto) {
    await requireUser(request, 'HR');
    return { data: await this.employees.createPosition(input.code, input.name, input.level), requestId: randomUUID() };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update position / level / status (HR only)' })
  async update(@Req() request: Request, @Param('id', ParseUUIDPipe) id: string, @Body() input: UpdatePositionDto) {
    await requireUser(request, 'HR');
    return { data: await this.employees.updatePosition(id, input), requestId: randomUUID() };
  }
}
