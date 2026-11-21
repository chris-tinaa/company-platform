import { useState } from 'react';
import { Alert, Form, Input, Modal, Typography, message } from 'antd';
import { api, getApiError } from '../../shared/api/http';

type EmployeeIdentity = { id: string; employee_number: string; full_name: string };
type ActivationValues = { password: string; confirmPassword: string };

type Props = {
  employee: EmployeeIdentity;
  onClose: () => void;
  onActivated: () => void;
  mode?: 'initial' | 'reactivation';
};

export default function ActivateAccountModal({ employee, onClose, onActivated, mode = 'initial' }: Props) {
  const [form] = Form.useForm<ActivationValues>();
  const [saving, setSaving] = useState(false);
  const [reactivationStarted, setReactivationStarted] = useState(false);

  async function awaitPendingAccount(): Promise<void> {
    for (let attempt = 0; attempt < 18; attempt++) {
      const response = await api.get<{ data: { status: string } }>(`/auth/accounts/${employee.id}/status`);
      if (response.data.data.status === 'PENDING') return;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    throw new Error('Sinkronisasi akun belum selesai. Coba lagi atau gunakan tombol Aktivasi Akun setelah status menjadi PENDING.');
  }

  async function submit(values: ActivationValues): Promise<void> {
    if (saving) return;
    setSaving(true);
    try {
      if (mode === 'reactivation') {
        if (!reactivationStarted) {
          try {
            await api.patch(`/employees/${employee.id}/reactivate`, {});
          } catch (error) {
            const latest = await api.get<{ data: { status: string } }>(`/employees/${employee.id}`);
            if (latest.data.data.status !== 'ACTIVE') throw error;
          }
          setReactivationStarted(true);
        }
        await awaitPendingAccount();
      }
      await api.post(`/auth/accounts/${employee.id}/activate`, { password: values.password });
      message.success(mode === 'reactivation'
        ? 'Karyawan aktif kembali dan wajib menggunakan kata sandi baru.'
        : 'Akun berhasil diaktifkan. Karyawan dapat masuk menggunakan kata sandi awal.');
      form.resetFields();
      onActivated();
    } catch (error) {
      message.error(error instanceof Error && error.message.startsWith('Sinkronisasi akun belum')
        ? error.message : getApiError(error));
    } finally {
      setSaving(false);
    }
  }

  return <Modal
    open
    title={mode === 'reactivation' ? 'Aktifkan Kembali Karyawan' : 'Aktivasi Akun Karyawan'}
    onCancel={() => {
      if (!saving) {
        if (reactivationStarted) message.warning('Karyawan sudah aktif tetapi akun masih memerlukan password baru. Selesaikan melalui Aktivasi Akun.');
        onClose();
      }
    }}
    onOk={() => form.submit()}
    okText={mode === 'reactivation' ? 'Aktifkan Kembali' : 'Aktifkan Akun'}
    cancelText="Batal"
    confirmLoading={saving}
    okButtonProps={{ disabled: saving }}
    destroyOnHidden
  >
    <Typography.Paragraph>
      {mode === 'reactivation' ? 'Tetapkan kata sandi baru untuk' : 'Tetapkan kata sandi awal untuk'} <strong>{employee.full_name}</strong> ({employee.employee_number}).
    </Typography.Paragraph>
    {mode === 'reactivation' && <Alert type={reactivationStarted ? 'info' : 'warning'} showIcon style={{ marginBottom: 16 }}
      message={reactivationStarted ? 'Menunggu aktivasi akun' : 'Kata sandi lama tidak berlaku lagi'}
      description={reactivationStarted ? 'Karyawan sudah aktif. Akun login menunggu event RabbitMQ dan harus diberi kata sandi baru. Tekan lagi untuk melanjutkan.' : 'Data karyawan akan diaktifkan melalui Employee Service, kemudian akun login akan diaktifkan menggunakan kata sandi baru.'} />}
    <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Rahasiakan kata sandi" description="Sampaikan kata sandi kepada karyawan melalui kanal yang aman. Kata sandi tidak dapat ditampilkan kembali setelah disimpan." />
    <Form form={form} layout="vertical" onFinish={(values) => void submit(values)}>
      <Form.Item name="password" label={mode === 'reactivation' ? 'Kata Sandi Baru' : 'Kata Sandi Awal'} rules={[
        { required: true, message: 'Kata sandi awal wajib diisi' },
        { min: 12, message: 'Kata sandi minimal 12 karakter' },
        { max: 72, message: 'Kata sandi maksimal 72 karakter' },
        { pattern: /[a-z]/, message: 'Harus mengandung huruf kecil' },
        { pattern: /[A-Z]/, message: 'Harus mengandung huruf besar' },
        { pattern: /[0-9]/, message: 'Harus mengandung angka' },
        { pattern: /[^A-Za-z0-9]/, message: 'Harus mengandung simbol' },
      ]}>
        <Input.Password autoComplete="new-password" maxLength={72} placeholder="Minimal 12 karakter, huruf, angka, dan simbol" />
      </Form.Item>
      <Form.Item name="confirmPassword" label="Konfirmasi Kata Sandi" dependencies={['password']} rules={[
        { required: true, message: 'Ulangi kata sandi awal' },
        ({ getFieldValue }) => ({
          validator(_, value: string | undefined) {
            if (value && value === getFieldValue('password')) return Promise.resolve();
            return Promise.reject(new Error('Konfirmasi kata sandi tidak sama'));
          },
        }),
      ]}>
        <Input.Password autoComplete="new-password" maxLength={72} placeholder="Ketik ulang kata sandi" />
      </Form.Item>
    </Form>
  </Modal>;
}
