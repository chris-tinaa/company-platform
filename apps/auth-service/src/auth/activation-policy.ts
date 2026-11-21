export type ProvisionedAccountStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE' | 'NOT_FOUND';
export type LifecycleStatus = 'ACTIVE' | 'INACTIVE' | null;

export function isStrongInitialPassword(password: string): boolean {
  const size = Buffer.byteLength(password, 'utf8');
  return size >= 12 && size <= 72 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
}

export function canActivatePendingAccount(account: ProvisionedAccountStatus, lifecycle: LifecycleStatus): boolean {
  return account === 'PENDING' && lifecycle === 'ACTIVE';
}
