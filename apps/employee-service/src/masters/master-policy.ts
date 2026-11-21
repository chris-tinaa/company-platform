/** Reference data input policy; application permissions are enforced separately. */
export function isMasterCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{1,31}$/.test(value);
}

export function isPositionLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 20;
}

export function canAssignMaster(departmentActive: boolean, positionActive: boolean): boolean {
  return departmentActive && positionActive;
}
