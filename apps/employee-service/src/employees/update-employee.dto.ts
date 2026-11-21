import { IsEmail, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEmployeeDto {
  @ApiProperty({ minimum: 1, description: 'Optimistic locking, from the employee GET response' })
  @IsInt() @Min(1)
  version!: number;
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(120)
  fullName?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsEmail() @MaxLength(190)
  email?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  departmentId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID()
  positionId?: string;
}
