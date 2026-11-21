import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'IT', maxLength: 32 })
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,31}$/)
  code!: string;
  @ApiProperty({ example: 'Teknologi Informasi', maxLength: 100 })
  @IsString() @IsNotEmpty() @MaxLength(100)
  name!: string;
}
export class UpdateDepartmentDto {
  @ApiPropertyOptional({ example: 'IT' })
  @IsOptional() @Matches(/^[A-Z][A-Z0-9_]{1,31}$/)
  code?: string;
  @ApiPropertyOptional({ example: 'Teknologi Informasi' })
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100)
  name?: string;
  @ApiPropertyOptional({ description: 'Soft-disable references; do not delete employees.' })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
export class CreatePositionDto extends CreateDepartmentDto {
  @ApiProperty({ example: 3, minimum: 1, maximum: 20 })
  @IsInt() @Min(1) @Max(20)
  level!: number;
}
export class UpdatePositionDto extends UpdateDepartmentDto {
  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 20 })
  @IsOptional() @IsInt() @Min(1) @Max(20)
  level?: number;
}
