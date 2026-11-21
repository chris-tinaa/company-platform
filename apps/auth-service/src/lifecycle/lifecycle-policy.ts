export type EmployeeEventType = 'employee.created' | 'employee.deactivated' | 'employee.reactivated';

export function shouldApplyLifecycle(currentVersion: number | null, incomingVersion: number): boolean {
  return Number.isSafeInteger(incomingVersion) && incomingVersion > 0 && (currentVersion === null || incomingVersion > currentVersion);
}

export function nextEventStatus(event: EmployeeEventType): 'PENDING' | 'INACTIVE' {
  return event === 'employee.deactivated' ? 'INACTIVE' : 'PENDING';
}
