import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Input, Radio, Select, Space, Typography } from 'antd';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { getApiError } from '../../shared/api/http';
import { resolveLoginCredentials, type LoginMode } from './login-mode';

const demoPassword = 'DemoAbsensi2026!';
const demo = import.meta.env.VITE_DEMO_MODE === 'true';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [userId, setUserId] = useState('EMP001');
  const [manualUserId, setManualUserId] = useState('');
  const [mode, setMode] = useState<LoginMode>('demo');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!loading && user) return <Navigate to={user.role === 'HR' ? '/karyawan' : '/absen'} replace />;
  const isDemoLogin = demo && mode === 'demo';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const credentials = resolveLoginCredentials(demo, mode, userId, manualUserId, password, demoPassword);
      const account = await login(credentials.userId, credentials.password);
      navigate(account.role === 'HR' ? '/karyawan' : '/absen', { replace: true });
    } catch (reason) {
      setError(getApiError(reason));
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="login-screen">
    <Card className="login-card">
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Typography.Text type="secondary">Portal karyawan</Typography.Text>
        <Typography.Title level={2} style={{ marginTop: 2 }}>Absensi WFH</Typography.Title>
        <Typography.Paragraph>Masuk untuk melakukan absensi atau memantau data karyawan.</Typography.Paragraph>
        {demo && <Alert type="info" showIcon description="Mode demo untuk keperluan testing. Pilih akun HR atau Karyawan. Kata sandi diisi otomatis." />}
        {demo && <Radio.Group className="login-mode" value={mode} onChange={(event) => { setMode(event.target.value === 'manual' ? 'manual' : 'demo'); setPassword(''); }} optionType="button" buttonStyle="solid" options={[
          { label: 'Akun Demo', value: 'demo' },
          { label: 'Akun Karyawan Baru', value: 'manual' },
        ]} />}
        {error && <Alert type="error" showIcon message={error} />}
        <form onSubmit={(event) => void submit(event)} className="stack-form">
          <label htmlFor="userId">User ID</label>
          {isDemoLogin ? <Select id="userId" value={userId} onChange={setUserId} size="large" options={[
            { value: 'HR001', label: 'HR - HR001' },
            { value: 'EMP001', label: 'Karyawan - EMP001' },
          ]} /> : <Input id="userId" size="large" value={manualUserId} autoComplete="username" onChange={(event) => setManualUserId(event.target.value)} maxLength={64} placeholder="Masukkan nomor karyawan" required />}
          <label htmlFor="password">Kata Sandi</label>
          <Input.Password id="password" size="large" disabled={isDemoLogin} value={isDemoLogin ? demoPassword : password} autoComplete={isDemoLogin ? 'off' : 'current-password'} onChange={(event) => setPassword(event.target.value)} required={!isDemoLogin} />
          <Button block type="primary" htmlType="submit" loading={submitting} size="large">Masuk</Button>
        </form>
      </Space>
    </Card>
  </main>;
}
