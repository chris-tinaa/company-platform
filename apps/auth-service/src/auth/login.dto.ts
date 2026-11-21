import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'EMP001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  user_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @ApiProperty({ format: 'password' })
  password!: string;
}
