import { Body, Controller, Get, Header, Headers, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { requireUser } from '../security/current-user';
import { AttendanceService, type CheckInPayload } from './attendance.service';

@ApiTags('Attendance')
@ApiCookieAuth('access_token')
@Controller('api/v1/attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('location/reverse')
  @Header('Cache-Control', 'no-store')
  async reverseLocation(
    @Req() request: Request,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
  ) {
    const user = await requireUser(request, 'EMPLOYEE');
    return { data: await this.attendance.reverseLocation(user, latitude, longitude), requestId: randomUUID() };
  }

  @ApiOperation({ summary: 'Employee WFH check-in with live camera photo + GPS; one per Jakarta day' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['photo', 'latitude', 'longitude', 'locationAccuracy'], properties: {
    photo: { type: 'string', format: 'binary' }, latitude: { type: 'number', example: -6.2 },
    longitude: { type: 'number', example: 106.816 }, locationAccuracy: { type: 'number', example: 12 },
  } } })
  @Post('check-in')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5_242_880, files: 1, fields: 3 } }))
  async checkIn(
    @Req() request: Request,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CheckInPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const user = await requireUser(request, 'EMPLOYEE');
    return { data: await this.attendance.checkIn(user, key, body, file), requestId: randomUUID() };
  }

  @Get('me/export')
  async exportMine(@Req() request: Request, @Res() response: Response, @Query('from') from?: string, @Query('to') to?: string): Promise<void> {
    const user = await requireUser(request, 'EMPLOYEE');
    const csv = await this.attendance.export(user, 'EMPLOYEE', from, to);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="riwayat-absensi.csv"');
    response.setHeader('Cache-Control', 'no-store');
    response.send(csv);
  }

  @Get('export')
  async exportHR(@Req() request: Request, @Res() response: Response, @Query('from') from?: string, @Query('to') to?: string): Promise<void> {
    const user = await requireUser(request, 'HR');
    const csv = await this.attendance.export(user, 'HR', from, to);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="monitoring-absensi.csv"');
    response.setHeader('Cache-Control', 'no-store');
    response.send(csv);
  }

  @Get('me')
  async mine(
    @Req() request: Request,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = await requireUser(request, 'EMPLOYEE');
    return { data: await this.attendance.mine(user, page, pageSize, from, to), requestId: randomUUID() };
  }

  @Get()
  async hrList(
    @Req() request: Request,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const user = await requireUser(request, 'HR');
    return { data: await this.attendance.hrList(user, page, pageSize, from, to), requestId: randomUUID() };
  }
}
