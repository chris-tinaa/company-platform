import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class UpdateEmployeeDto {
  @IsInt()
  @Min(1)
  version!: number;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;
  @IsOptional()
  @IsEmail()
  @MaxLength(190)
  email?: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;
}
