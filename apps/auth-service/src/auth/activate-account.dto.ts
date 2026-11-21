import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ActivateAccountDto {
  @IsString()
  @MinLength(12, { message: 'Kata sandi minimal 12 karakter' })
  @MaxLength(72, { message: 'Kata sandi maksimal 72 karakter' })
  @ApiProperty({ description: 'New initial/reactivation password (different from the previous password)', minLength: 12, maxLength: 72, format: 'password' })
  password!: string;
}
