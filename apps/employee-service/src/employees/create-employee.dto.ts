import { IsEmail, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'EMP002', maxLength: 32 })
  @IsString() @IsNotEmpty() @MaxLength(32)
  employeeNumber!: string;
  @ApiProperty({ example: 'Budi Santoso', maxLength: 120 })
  @IsString() @IsNotEmpty() @MaxLength(120)
  fullName!: string;
  @ApiProperty({ example: 'budi@example.com' })
  @IsEmail() @MaxLength(190)
  email!: string;
  @ApiProperty({ format: 'uuid', description: 'Department master ID (active)' })
  @IsUUID()
  departmentId!: string;
  @ApiProperty({ format: 'uuid', description: 'Position master ID (active)' })
  @IsUUID()
  positionId!: string;
}
