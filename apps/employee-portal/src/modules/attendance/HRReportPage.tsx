import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Input, Pagination, Space, Table, Typography, message } from 'antd';
import { DownloadOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { api, getApiError } from '../../shared/api/http';
import PhotoPreviewModal from '../document/PhotoPreviewModal';

type Attendance = { id: string; fullName: string; employeeId: string; attendanceDate: string; checkedInAt: string; documentId: string; latitude: number; longitude: number; locationAddress: string | null };
type Page = { items: Attendance[]; total: number; page: number; pageSize: number };

export default function HRReportPage() {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filter, setFilter] = useState({ from: '', to: '' });
  const [previewId, setPreviewId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['hr-attendance', page, filter], queryFn: async () => {
    const response = await api.get<{ data: Page }>('/attendance', { params: { page, pageSize: 10, ...filter } });
    return response.data.data;
  } });

  async function download(): Promise<void> {
    try {
      const response = await api.get('/attendance/export', { responseType: 'blob', params: filter });
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'monitoring-absensi.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) { message.error(getApiError(reason)); }
  }

  return <div className="content-container">
    <div className="page-heading"><div><Typography.Title level={2}>Monitoring Absensi</Typography.Title><Typography.Paragraph type="secondary">Monitoring hanya baca. HR tidak dapat mengubah absensi.</Typography.Paragraph></div>
      <Button icon={<DownloadOutlined />} onClick={() => void download()}>Unduh CSV</Button></div>
    <Typography.Paragraph type="secondary">Alamat merupakan perkiraan dari <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>, bukan bukti alamat rumah.</Typography.Paragraph>
    <Card>
      <div className="filters"><label>Dari tanggal <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Sampai tanggal <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <Button icon={<SearchOutlined />} type="primary" onClick={() => { setFilter({ from, to }); setPage(1); }}>Terapkan</Button></div>
      {query.isError && <Alert type="error" message={getApiError(query.error)} action={<Button size="small" onClick={() => void query.refetch()}>Coba Lagi</Button>} />}
      <Table<Attendance> rowKey="id" loading={query.isLoading} dataSource={query.data?.items ?? []} pagination={false} scroll={{ x: 780 }} locale={{ emptyText: <Empty description="Belum ada data absensi" /> }} columns={[
        { title: 'Karyawan', dataIndex: 'fullName', key: 'name' },
        { title: 'Tanggal', dataIndex: 'attendanceDate', key: 'date' },
        { title: 'Waktu', dataIndex: 'checkedInAt', key: 'time', render: (value: string) => new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) },
        { title: 'Alamat perkiraan', key: 'location', render: (_, record) => <div className="location-address-cell"><Typography.Text>{record.locationAddress ?? 'Alamat tidak tersedia'}</Typography.Text><Typography.Text type="secondary">{record.latitude}, {record.longitude}</Typography.Text></div> },
        { title: 'Bukti', key: 'evidence', render: (_, record) => <Button size="small" icon={<EyeOutlined />} onClick={() => setPreviewId(record.documentId)}>Lihat</Button> },
      ]} />
      <Space className="pagination-bar"><Pagination current={page} pageSize={10} total={query.data?.total ?? 0} onChange={setPage} showSizeChanger={false} /></Space>
    </Card>
    <PhotoPreviewModal documentId={previewId} onClose={() => setPreviewId(null)} />
  </div>;
}
