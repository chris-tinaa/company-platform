export type LoginMode = 'demo' | 'manual';

export function resolveLoginCredentials(demoEnabled: boolean, mode: LoginMode, demoId: string, manualId: string, password: string, demoPassword: string): { userId: string; password: string } {
  if (demoEnabled && mode === 'demo') return { userId: demoId, password: demoPassword };
  return { userId: manualId.trim(), password };
}
