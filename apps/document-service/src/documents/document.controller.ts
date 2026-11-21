import { Body, Controller, Get, Headers, Param, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiCookieAuth, ApiExcludeController, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { requireInternalKey, requireUser } from '../security/current-user';
import { DocumentService } from './document.service';

@ApiExcludeController()
@Controller('internal/documents')
export class InternalDocumentController {
  constructor(private readonly documents: DocumentService) {}

  @Post('stage')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5_242_880, files: 1, fields: 2 } }))
  async stage(
    @Headers('x-service-key') key: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { employeeId?: string; uploaderId?: string },
  ) {
    requireInternalKey(key);
    return { data: await this.documents.stage(file, body.employeeId ?? '', body.uploaderId ?? '') };
  }

  @Post(':id/finalize')
  async finalize(
    @Headers('x-service-key') key: string | undefined,
    @Param('id') id: string,
    @Body() body: { attendanceId?: string },
  ) {
    requireInternalKey(key);
    await this.documents.finalize(id, body.attendanceId ?? '');
    return { data: { status: 'READY' } };
  }
}

@ApiTags('Documents')
@ApiCookieAuth('access_token')
@Controller('api/v1/documents')
export class DocumentController {
  constructor(private readonly documents: DocumentService) {}

  @ApiOperation({ summary: 'Download private photo if the requester owns it or is HR' })
  @ApiProduces('image/jpeg', 'image/png')
  @Get(':id/content')
  async content(@Req() request: Request, @Res() response: Response, @Param('id') documentId: string): Promise<void> {
    const actor = await requireUser(request);
    const photo = await this.documents.content(documentId, actor);
    response.setHeader('Content-Type', photo.mime);
    response.setHeader('Content-Length', String(photo.bytes.length));
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(photo.bytes);
  }
}
