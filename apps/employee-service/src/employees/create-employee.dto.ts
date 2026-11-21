import { IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  employeeNumber!: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;
  @IsEmail()
  @MaxLength(190)
  email!: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  department!: string;
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  position!: string;
}
