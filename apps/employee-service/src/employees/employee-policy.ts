export function shouldEmitDeactivation(currentStatus: 'ACTIVE' | 'INACTIVE'): boolean {
  return currentStatus === 'ACTIVE';
}

export function canDeactivateEmployee(employeeNumber: string): boolean {
  return !['HR001', 'EMP001'].includes(employeeNumber);
}

export function shouldEmitReactivation(currentStatus: 'ACTIVE' | 'INACTIVE'): boolean {
  return currentStatus === 'INACTIVE';
}
