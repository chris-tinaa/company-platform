export type AccountRole = "HR" | "EMPLOYEE";
export type AccountStatus = "ACTIVE" | "PENDING" | "INACTIVE";
export type ApiError = {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
};
