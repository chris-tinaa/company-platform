import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Form, Grid, Input, Modal, Pagination, Select, Space, Table, Tag, Typography, message } from 'antd';
import { EditOutlined, PlusOutlined, StopOutlined, KeyOutlined, CheckCircleOutlined } from '@ant-design/icons';
import ActivateAccountModal from './ActivateAccountModal';
import MasterDataModal, { loadDepartments, loadPositions } from './MasterDataModal';
import { api, getApiError } from '../../shared/api/http';

type Employee = { id: string; employee_number: string; full_name: string; email: string; department_id: string; position_id: string; department: string; position: string; position_level: number; status: 'ACTIVE' | 'INACTIVE'; version: number };
type Page = { items: Employee[]; total: number; page: number; pageSize: number };
type EmployeeForm = { employeeNumber: string; fullName: string; email: string; departmentId: string; positionId: string };

const { useBreakpoint } = Grid;

export default function EmployeeDirectoryPage() {
  const queryClient = useQueryClient();
  const screens = useBreakpoint();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [masterOpen, setMasterOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<Employee | null>(null);
  const [activationMode, setActivationMode] = useState<'initial' | 'reactivation'>('initial');
  const [checkingAccount, setCheckingAccount] = useState<string | null>(null);
  const [form] = Form.useForm<EmployeeForm>();
  const departments = useQuery({ queryKey: ['departments'], queryFn: loadDepartments });
  const positions = useQuery({ queryKey: ['positions'], queryFn: loadPositions });

  const query = useQuery({ queryKey: ['employees', page, keyword], queryFn: async () => {
    const response = await api.get<{ data: Page }>('/employees', { params: { page, pageSize: 10, search: keyword } });
    return response.data.data;
  } });

  useEffect(() => {
    if (!modalOpen) return;
    if (editing) form.setFieldsValue({ employeeNumber: editing.employee_number, fullName: editing.full_name, email: editing.email, departmentId: editing.department_id, positionId: editing.position_id });
    else form.resetFields();
  }, [editing, modalOpen, form]);

  function openCreate() { setEditing(null); setModalOpen(true); }
  function openEdit(employee: Employee) { setEditing(employee); setModalOpen(true); }

  async function save(values: EmployeeForm): Promise<void> {
    if (saving) return;
    setSaving(true);
    try {
      if (editing) await api.patch(`/employees/${editing.id}`, {
        version: Number(editing.version), fullName: values.fullName, email: values.email,
        departmentId: values.departmentId, positionId: values.positionId,
      });
      else await api.post('/employees', values);
      message.success(editing ? 'Data karyawan diperbarui' : 'Karyawan baru berhasil dibuat');
      setModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch (reason) { message.error(getApiError(reason)); }
    finally { setSaving(false); }
  }

  function askDeactivate(employee: Employee) {
    Modal.confirm({
      title: 'Nonaktifkan karyawan?',
      content: `${employee.full_name} tidak akan dapat melakukan absensi setelah akun dinonaktifkan.`,
      okText: 'Nonaktifkan', cancelText: 'Batal', okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.delete(`/employees/${employee.id}`);
          message.success('Karyawan dinonaktifkan');
          await queryClient.invalidateQueries({ queryKey: ['employees'] });
        } catch (reason) { message.error(getApiError(reason)); }
      },
    });
  }

  async function accountStatus(employee: Employee): Promise<void> {
    try {
      const response = await api.get<{ data: { status: string } }>(`/auth/accounts/${employee.id}/status`);
      message.info(`Status akun ${employee.employee_number}: ${response.data.data.status}`);
    } catch (reason) { message.error(getApiError(reason)); }
  }

  async function prepareActivation(employee: Employee): Promise<void> {
    if (checkingAccount) return;
    setCheckingAccount(employee.id);
    try {
      const response = await api.get<{ data: { status: string } }>(`/auth/accounts/${employee.id}/status`);
      const status = response.data.data.status;
      if (status === 'PENDING') {
        setActivationMode('initial');
        setActivating(employee);
      }
      else if (status === 'NOT_FOUND') message.info('Akun sedang diproses oleh layanan. Periksa status beberapa saat lagi.');
      else message.info(`Akun ${employee.employee_number} sudah berstatus ${status}`);
    } catch (error) {
      message.error(getApiError(error));
    } finally {
      setCheckingAccount(null);
    }
  }

  function prepareReactivation(employee: Employee): void {
    if (employee.status !== 'INACTIVE') return;
    setActivationMode('reactivation');
    setActivating(employee);
  }

  const actions = (employee: Employee) => <Space wrap>
    <Button size="small" icon={<EditOutlined />} disabled={employee.status !== 'ACTIVE'} onClick={() => openEdit(employee)}>Ubah</Button>
    <Button size="small" onClick={() => void accountStatus(employee)}>Status Akun</Button>
    <Button size="small" icon={<KeyOutlined />} loading={checkingAccount === employee.id} disabled={employee.status !== 'ACTIVE'} onClick={() => void prepareActivation(employee)}>Aktivasi Akun</Button>
    {employee.status === 'INACTIVE'
      ? <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => prepareReactivation(employee)}>Aktifkan Kembali</Button>
      : <Button danger size="small" icon={<StopOutlined />} onClick={() => askDeactivate(employee)}>Nonaktifkan</Button>}
  </Space>;

  return <div className="content-container">
    <div className="page-heading"><div><Typography.Title level={2}>Data Karyawan</Typography.Title><Typography.Paragraph type="secondary">Kelola data dan status karyawan. Akun baru berstatus menunggu aktivasi.</Typography.Paragraph></div>
      <Space wrap><Button onClick={() => setMasterOpen(true)}>Master Departemen & Jabatan</Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Tambah Karyawan</Button></Space></div>
    <Card>
      <Space className="filters"><Input.Search placeholder="Cari nama atau nomor karyawan" allowClear value={search} onChange={(event) => setSearch(event.target.value)} onSearch={() => { setKeyword(search); setPage(1); }} enterButton="Cari" /></Space>
      {query.isError && <Alert type="error" message={getApiError(query.error)} action={<Button onClick={() => void query.refetch()}>Coba Lagi</Button>} />}
      {screens.md ? <Table<Employee> dataSource={query.data?.items ?? []} loading={query.isLoading} rowKey="id" pagination={false} scroll={{ x: 980 }} locale={{ emptyText: <Empty description="Belum ada karyawan" /> }} columns={[
        { title: 'NIK', dataIndex: 'employee_number', key: 'number' },
        { title: 'Nama', dataIndex: 'full_name', key: 'name' },
        { title: 'Email', dataIndex: 'email', key: 'email' },
        { title: 'Departemen', dataIndex: 'department', key: 'department' },
        { title: 'Jabatan / Level', key: 'position', render: (_, employee) => `${employee.position} (Level ${employee.position_level})` },
        { title: 'Status', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={value === 'ACTIVE' ? 'green' : 'red'}>{value === 'ACTIVE' ? 'Aktif' : 'Tidak Aktif'}</Tag> },
        { title: 'Tindakan', key: 'action', render: (_, employee) => actions(employee) },
      ]} /> : <div className="employee-cards">
        {query.data?.items.length === 0 && <Empty description="Belum ada karyawan" />}
        {(query.data?.items ?? []).map((employee) => <Card size="small" key={employee.id} title={employee.full_name} extra={<Tag color={employee.status === 'ACTIVE' ? 'green' : 'red'}>{employee.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}</Tag>}>
          <Typography.Paragraph style={{ marginBottom: 4 }}>{employee.employee_number}</Typography.Paragraph>
          <Typography.Paragraph type="secondary">{employee.department} · {employee.position} (Level {employee.position_level})</Typography.Paragraph>
          {actions(employee)}
        </Card>)}
      </div>}
      <div className="pagination-bar"><Pagination current={page} pageSize={10} total={query.data?.total ?? 0} onChange={setPage} showSizeChanger={false} /></div>
    </Card>
    <Modal open={modalOpen} title={editing ? 'Ubah Karyawan' : 'Tambah Karyawan'} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="Simpan" cancelText="Batal" confirmLoading={saving} destroyOnHidden>
      <Form layout="vertical" form={form} onFinish={(values) => void save(values)} className="employee-form">
        {(departments.isError || positions.isError) && <Alert style={{ marginBottom: 16 }} type="error" showIcon
          message="Master departemen atau jabatan gagal dimuat" description="Pastikan Employee Service berjalan, lalu muat ulang halaman." />}
        {!editing && <Form.Item label="Nomor Karyawan" name="employeeNumber" rules={[{ required: true, message: 'Nomor karyawan wajib diisi' }, { max: 32 }]}><Input /></Form.Item>}
        <Form.Item label="Nama Lengkap" name="fullName" rules={[{ required: true, message: 'Nama wajib diisi' }, { max: 120 }]}><Input /></Form.Item>
        <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email', message: 'Email tidak valid' }]}><Input type="email" /></Form.Item>
        <Form.Item label="Departemen" name="departmentId" rules={[{ required: true, message: 'Departemen wajib dipilih' }]}>
          <Select loading={departments.isLoading} placeholder="Pilih departemen" showSearch optionFilterProp="label"
            options={(departments.data ?? []).filter((d) => Boolean(d.is_active) || d.id === editing?.department_id).map((d) =>
              ({ value: d.id, label: `${d.name}${d.is_active ? '' : ' (nonaktif)'}`, disabled: !d.is_active }))} />
        </Form.Item>
        <Form.Item label="Jabatan" name="positionId" rules={[{ required: true, message: 'Jabatan wajib dipilih' }]}>
          <Select loading={positions.isLoading} placeholder="Pilih jabatan" showSearch optionFilterProp="label"
            options={(positions.data ?? []).filter((p) => Boolean(p.is_active) || p.id === editing?.position_id).map((p) =>
              ({ value: p.id, label: `${p.name} (Level ${p.level})${p.is_active ? '' : ' (nonaktif)'}`, disabled: !p.is_active }))} />
        </Form.Item>
      </Form>
    </Modal>
    <MasterDataModal open={masterOpen} onClose={() => setMasterOpen(false)} />
    {activating && <ActivateAccountModal
      employee={activating}
      mode={activationMode}
      onClose={() => {
        setActivating(null);
        void queryClient.invalidateQueries({ queryKey: ['employees'] });
      }}
      onActivated={() => {
        setActivating(null);
        void queryClient.invalidateQueries({ queryKey: ['employees'] });
      }}
    />}
  </div>;
}
