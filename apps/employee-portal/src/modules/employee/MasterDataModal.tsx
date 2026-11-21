import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, InputNumber, Modal, Space, Switch, Tabs, Table, Tag, Typography, message } from 'antd';
import { api, getApiError } from '../../shared/api/http';

export type Department = { id: string; code: string; name: string; is_active: number };
export type Position = Department & { level: number };
export type MasterItem = Department | Position;

const endpoints = { department: '/departments', position: '/positions' } as const;
type MasterKind = keyof typeof endpoints;
type MasterInput = { code: string; name: string; level?: number; isActive?: boolean };

export async function loadDepartments(): Promise<Department[]> {
  const response = await api.get<{ data: Department[] }>('/departments');
  return response.data.data;
}
export async function loadPositions(): Promise<Position[]> {
  const response = await api.get<{ data: Position[] }>('/positions');
  return response.data.data;
}

export default function MasterDataModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [kind, setKind] = useState<MasterKind>('department');
  const [editing, setEditing] = useState<MasterItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<MasterInput>();
  const departments = useQuery({ queryKey: ['departments'], queryFn: loadDepartments, enabled: open });
  const positions = useQuery({ queryKey: ['positions'], queryFn: loadPositions, enabled: open });
  const rows: MasterItem[] = kind === 'department' ? (departments.data ?? []) : (positions.data ?? []);
  const isLoading = kind === 'department' ? departments.isLoading : positions.isLoading;
  const currentError = kind === 'department' ? departments.error : positions.error;

  function startNew(): void {
    setEditing(null);
    form.setFieldsValue({ code: '', name: '', level: 1, isActive: true });
  }
  function startEdit(value: MasterItem): void {
    setEditing(value);
    form.setFieldsValue({ code: value.code, name: value.name,
      level: 'level' in value ? value.level : 1, isActive: Boolean(value.is_active) });
  }
  function setTab(next: string): void {
    setKind(next as MasterKind);
    setEditing(null);
    form.resetFields();
  }
  async function save(values: MasterInput): Promise<void> {
    if (saving) return;
    setSaving(true);
    const payload = kind === 'position' ? { code: values.code, name: values.name, level: values.level }
      : { code: values.code, name: values.name };
    try {
      if (editing) await api.patch(`${endpoints[kind]}/${editing.id}`, { ...payload, isActive: values.isActive });
      else await api.post(endpoints[kind], payload);
      message.success(editing ? 'Master berhasil diperbarui' : 'Master berhasil dibuat');
      await client.invalidateQueries({ queryKey: [kind === 'department' ? 'departments' : 'positions'] });
      await client.invalidateQueries({ queryKey: ['employees'] });
      startNew();
    } catch (error) { message.error(getApiError(error)); }
    finally { setSaving(false); }
  }

  return <Modal open={open} onCancel={onClose} footer={null} title="Master Departemen & Jabatan" width={760} destroyOnHidden>
    <Tabs activeKey={kind} onChange={setTab} items={[
      { key: 'department', label: 'Departemen' }, { key: 'position', label: 'Jabatan' },
    ]} />
    {currentError && <Alert type="error" showIcon message={getApiError(currentError)} style={{ marginBottom: 12 }} />}
    <Table<MasterItem> size="small" rowKey="id" pagination={{ pageSize: 5 }} dataSource={rows} loading={isLoading}
      scroll={{ x: 540 }} columns={[
        { title: 'Kode', dataIndex: 'code', key: 'code' },
        { title: 'Nama', dataIndex: 'name', key: 'name' },
        ...(kind === 'position' ? [{ title: 'Level', dataIndex: 'level', key: 'level' }] : []),
        { title: 'Status', dataIndex: 'is_active', key: 'status', render: (value: number) =>
          <Tag color={value ? 'green' : 'red'}>{value ? 'Aktif' : 'Nonaktif'}</Tag> },
        { title: 'Tindakan', key: 'action', render: (_: unknown, record: MasterItem) =>
          <Button size="small" onClick={() => startEdit(record)}>Ubah</Button> },
      ]} />
    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
      <Typography.Text strong>{editing ? 'Ubah Master' : 'Tambah Master'}</Typography.Text>
      <Button onClick={startNew}>Data Baru</Button>
    </Space>
    <Form form={form} layout="vertical" onFinish={(values) => void save(values)} initialValues={{ level: 1, isActive: true }}>
      <Form.Item label="Kode" name="code" rules={[{ required: true, message: 'Kode wajib diisi' },
        { pattern: /^[A-Z][A-Z0-9_]{1,31}$/, message: 'Gunakan huruf kapital, angka, underscore; 2-32 karakter' }]}>
        <Input maxLength={32} autoComplete="off" placeholder="Contoh: IT, HR, SENIOR_STAFF" />
      </Form.Item>
      <Form.Item label="Nama" name="name" rules={[{ required: true, whitespace: true }, { max: 100 }]}>
        <Input maxLength={100} />
      </Form.Item>
      {kind === 'position' && <Form.Item label="Level Jabatan" name="level" rules={[{ required: true }]}>
        <InputNumber min={1} max={20} precision={0} style={{ width: '100%' }} />
      </Form.Item>}
      {editing && <Form.Item label="Status Aktif" name="isActive" valuePropName="checked"><Switch /></Form.Item>}
      <Button type="primary" block htmlType="submit" loading={saving}>{editing ? 'Simpan Perubahan' : 'Tambah Master'}</Button>
    </Form>
  </Modal>;
}
