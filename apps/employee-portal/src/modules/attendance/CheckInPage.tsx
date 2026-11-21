import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Spin, Tag, Typography, message } from 'antd';
import { CameraOutlined, EnvironmentOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api, getApiError } from '../../shared/api/http';
import { compressPhoto } from '../../shared/media/compress-photo';
import { canCaptureFrame, isFreshLocation, LOCATION_MAX_AGE_MS, type CameraLocationFix } from '../../shared/media/camera-policy.mjs';

type Location = Pick<CameraLocationFix, 'latitude' | 'longitude' | 'accuracy'>;
type Snapshot = { key: string; photo: File; location: Location };
type CheckInResult = { attendanceDate: string; checkedInAt: string; documentId: string; locationAddress: string | null };
type AddressResponse = { address: string | null; latitude: number; longitude: number; provider: string | null };

function getLocation(): Promise<CameraLocationFix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Perangkat tidak mendukung lokasi GPS'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        acquiredAt: position.timestamp,
      }),
      (reason) => reject(new Error(reason.code === 1
        ? 'Izin lokasi ditolak. Aktifkan izin lokasi pada browser untuk melanjutkan.'
        : 'Lokasi tidak tersedia. Periksa GPS dan koneksi perangkat, lalu coba lagi.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

function cameraError(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === 'NotAllowedError') {
    return 'Izin kamera ditolak. Aktifkan izin kamera pada browser untuk melanjutkan.';
  }
  if (reason instanceof DOMException && reason.name === 'NotFoundError') {
    return 'Kamera tidak ditemukan pada perangkat ini.';
  }
  return 'Kamera tidak dapat dibuka. Periksa izin kamera dan coba lagi.';
}

export default function CheckInPage() {
  const queryClient = useQueryClient();
  const [location, setLocation] = useState<CameraLocationFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationAddress, setLocationAddress] = useState<string | null>(null);
  const [addressUnavailable, setAddressUnavailable] = useState(false);
  const [photoAddress, setPhotoAddress] = useState<string | null>(null);
  const [cameraOpening, setCameraOpening] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoLocation, setPhotoLocation] = useState<Location | null>(null);
  const [preview, setPreview] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const busy = useRef(false);
  const capturing = useRef(false);
  const cameraRequest = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const closeCamera = useCallback(() => {
    cameraRequest.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
    setCameraOpening(false);
  }, []);

  useEffect(() => {
    return () => {
      cameraRequest.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {
      setError('Video kamera tidak dapat diputar. Tutup kamera lalu coba lagi.');
      closeCamera();
    });
    return () => { video.srcObject = null; };
  }, [cameraActive, closeCamera]);

  useEffect(() => {
    if (!location || photo) return;
    const remaining = location.acquiredAt + LOCATION_MAX_AGE_MS - Date.now();
    const timer = window.setTimeout(() => {
      setLocation(null);
      setLocationAddress(null);
      setAddressUnavailable(false);
      closeCamera();
      setError('Lokasi sudah kedaluwarsa. Perbarui lokasi sebelum mengambil foto.');
    }, Math.max(0, remaining + 25));
    return () => window.clearTimeout(timer);
  }, [location, photo, closeCamera]);

  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function requestLocation(): Promise<void> {
    if (locating || submitting || compressing || photo || snapshot || result) return;
    closeCamera();
    setError('');
    setLocation(null);
    setLocationAddress(null);
    setAddressUnavailable(false);
    setLocating(true);
    try {
      const fix = await getLocation();
      if (!isFreshLocation(fix)) throw new Error('Lokasi tidak valid. Coba aktifkan GPS lagi.');
      setLocation(fix);
      try {
        const response = await api.get<{ data: AddressResponse }>('/attendance/location/reverse', {
          params: { latitude: fix.latitude, longitude: fix.longitude },
          timeout: 8000,
        });
        const readable = response.data.data.address;
        setLocationAddress(readable);
        setAddressUnavailable(!readable);
      } catch {
        setAddressUnavailable(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gagal membaca lokasi GPS');
    } finally {
      setLocating(false);
    }
  }

  async function openCamera(): Promise<void> {
    if (cameraOpening || locating || submitting || compressing || photo || snapshot || result) return;
    if (!isFreshLocation(location)) {
      setError('Dapatkan lokasi GPS terlebih dahulu sebelum membuka kamera.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Browser tidak mendukung kamera langsung. Gunakan browser HTTPS dengan akses kamera.');
      return;
    }
    setError('');
    closeCamera();
    const request = ++cameraRequest.current;
    setCameraOpening(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'user' } },
      });
      if (request !== cameraRequest.current || !isFreshLocation(location)) {
        stream.getTracks().forEach((track) => track.stop());
        if (request === cameraRequest.current) setError('Lokasi kedaluwarsa. Ambil lokasi kembali.');
        return;
      }
      streamRef.current = stream;
      setCameraActive(true);
    } catch (reason) {
      if (request === cameraRequest.current) setError(cameraError(reason));
    } finally {
      if (request === cameraRequest.current) setCameraOpening(false);
    }
  }

  async function takePhoto(): Promise<void> {
    if (capturing.current || cameraOpening || locating || submitting || result) return;
    const liveStream = streamRef.current?.getVideoTracks().some((track) => track.readyState === 'live') ?? false;
    if (!canCaptureFrame(location, liveStream)) {
      closeCamera();
      setError('Lokasi GPS harus tersedia dan terbaru sebelum mengambil foto.');
      return;
    }
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0 || video.readyState < 2) {
      setError('Kamera belum siap. Tunggu hingga gambar terlihat.');
      return;
    }
    capturing.current = true;
    setCompressing(true);
    setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Perangkat tidak dapat mengambil gambar kamera');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Gagal mengambil foto dari kamera')), 'image/jpeg', 0.9);
      });
      const compressed = await compressPhoto(new File([blob], 'kamera-absensi.jpg', { type: 'image/jpeg' }));
      const capturedLocation = location;
      if (!capturedLocation) throw new Error('Lokasi tidak tersedia');
      setPhoto(compressed);
      setPhotoAddress(locationAddress);
      setPhotoLocation({
        latitude: capturedLocation.latitude,
        longitude: capturedLocation.longitude,
        accuracy: capturedLocation.accuracy,
      });
      setSnapshot(null);
      closeCamera();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gagal mengambil foto dari kamera');
    } finally {
      capturing.current = false;
      setCompressing(false);
    }
  }

  function retake(): void {
    if (submitting || snapshot || result) return;
    closeCamera();
    setPhoto(null);
    setPhotoLocation(null);
    setPhotoAddress(null);
    setError('');
    if (!isFreshLocation(location)) setLocation(null);
  }

  async function submit(): Promise<void> {
    if (busy.current || compressing || result) return;
    if (!photo || !photoLocation) {
      setError('Aktifkan lokasi GPS dan ambil foto melalui kamera terlebih dahulu.');
      return;
    }
    busy.current = true;
    setSubmitting(true);
    setError('');
    try {
      const current = snapshot ?? { key: crypto.randomUUID(), photo, location: photoLocation };
      if (!snapshot) setSnapshot(current);
      const form = new FormData();
      form.append('photo', current.photo, current.photo.name);
      form.append('latitude', String(current.location.latitude));
      form.append('longitude', String(current.location.longitude));
      form.append('locationAccuracy', String(current.location.accuracy));
      const response = await api.post<{ data: CheckInResult }>('/attendance/check-in', form, {
        headers: { 'Idempotency-Key': current.key }, timeout: 30000,
      });
      setResult(response.data.data);
      setSnapshot(null);
      await queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
      message.success('Absensi WFH berhasil disimpan');
    } catch (reason) {
      setError(reason instanceof Error && !axios.isAxiosError(reason) ? reason.message : getApiError(reason));
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  const locationReady = isFreshLocation(location);

  return <div className="content-container">
    <Typography.Title level={2}>Absen WFH</Typography.Title>
    <Typography.Paragraph type="secondary">Aktifkan lokasi GPS terlebih dahulu, kemudian gunakan kamera langsung untuk mengambil bukti foto. Koordinat dapat dikirim ke OpenStreetMap untuk memperkirakan alamat dan disimpan bersama absensi. Galeri dan unggah berkas tidak tersedia.</Typography.Paragraph>
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={9}>
        <Card title={<Space><EnvironmentOutlined /> 1. Lokasi GPS</Space>} className="full-height-card">
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Tag color={locationReady || photoLocation ? 'green' : 'orange'}>{locationReady || photoLocation ? 'Lokasi tersedia' : 'Lokasi diperlukan'}</Tag>
            {locationReady && location && <Alert showIcon type="success" message="Lokasi berhasil didapat" description={`Akurasi: ${Math.round(location.accuracy)} meter`} />}
            {locating && locationReady && <Space><Spin size="small" /> Mencari detail alamat...</Space>}
            {locationReady && locationAddress && <div className="location-address"><Typography.Text strong>Alamat perkiraan:</Typography.Text><Typography.Paragraph>{locationAddress}</Typography.Paragraph><Typography.Text type="secondary">Sumber: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a></Typography.Text></div>}
            {locationReady && addressUnavailable && <Alert showIcon type="warning" message="Alamat teks belum ditemukan" description="Koordinat GPS tetap tersedia. Anda masih dapat mengambil foto dan absen." />}
            {locationReady && location && <Typography.Text type="secondary">Koordinat: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</Typography.Text>}
            {photoLocation && <div className="location-address"><Typography.Text strong>Lokasi foto:</Typography.Text><Typography.Paragraph>{photoAddress ?? 'Alamat teks tidak tersedia; koordinat GPS telah disimpan bersama foto.'}</Typography.Paragraph><Typography.Text type="secondary">{photoLocation.latitude.toFixed(6)}, {photoLocation.longitude.toFixed(6)}</Typography.Text></div>}
            {!locationReady && !photoLocation && <Typography.Paragraph>Izinkan browser mengakses lokasi. Tanpa lokasi, kamera tidak dapat dibuka dan foto tidak dapat diambil.</Typography.Paragraph>}
            <Button size="large" block icon={<EnvironmentOutlined />} loading={locating} disabled={Boolean(photo || snapshot || result) || submitting || compressing} onClick={() => void requestLocation()}>
              {locationReady ? 'Perbarui Lokasi' : 'Aktifkan Lokasi'}
            </Button>
          </Space>
        </Card>
      </Col>
      <Col xs={24} lg={15}>
        <Card title={<Space><CameraOutlined /> 2. Foto Kamera Langsung</Space>} className="full-height-card">
          {cameraActive ? <div className="camera-frame"><video ref={videoRef} className="camera-preview" autoPlay playsInline muted aria-label="Tampilan kamera langsung" /><div className="camera-address-overlay">{locationAddress ?? 'Alamat teks tidak tersedia'}{location && <small>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</small>}</div></div> :
            preview ? <div className="camera-frame"><img className="photo-preview" src={preview} alt="Pratinjau foto absensi yang sudah dikompresi" /><div className="camera-address-overlay">{photoAddress ?? 'Alamat teks tidak tersedia'}{photoLocation && <small>{photoLocation.latitude.toFixed(6)}, {photoLocation.longitude.toFixed(6)}</small>}</div></div> :
              <div className="photo-placeholder">{locationReady ? 'Lokasi siap. Buka kamera untuk mengambil foto.' : 'Aktifkan lokasi GPS untuk menggunakan kamera.'}</div>}
          <div className="photo-actions">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {cameraActive ? <>
                <Button type="primary" size="large" block icon={<CameraOutlined />} loading={compressing} disabled={!locationReady || submitting || locating} onClick={() => void takePhoto()}>Ambil Foto</Button>
                <Button size="large" block onClick={closeCamera} disabled={compressing}>Tutup Kamera</Button>
              </> : photo ? <>
                <Typography.Text type="secondary">Foto kamera berhasil dikompresi: {(photo.size / 1024).toFixed(0)} KB.</Typography.Text>
                <Typography.Text type="secondary">Alamat saat foto: {photoAddress ?? 'Tidak tersedia (GPS tetap tercatat)'}</Typography.Text>
                {!snapshot && !result && <Button size="large" block icon={<ReloadOutlined />} onClick={retake} disabled={submitting}>Ambil Ulang Foto</Button>}
              </> : <Button type="primary" size="large" block icon={<CameraOutlined />} loading={cameraOpening} disabled={!locationReady || locating || submitting || compressing || Boolean(snapshot || result)} onClick={() => void openCamera()}>
                Buka Kamera
              </Button>}
            </Space>
          </div>
          {compressing && <Space><Spin size="small" /> Mengompresi foto...</Space>}
        </Card>
      </Col>
    </Row>
    <Card style={{ marginTop: 16 }} title="3. Konfirmasi Absensi">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Tag color="blue">WFH</Tag>
        <Typography.Paragraph type="secondary">Tanggal dan waktu absensi ditentukan oleh server. Foto dan lokasi diambil saat proses kamera langsung. Koordinat akan dikirim ke OpenStreetMap untuk perkiraan alamat, lalu disimpan bersama absensi.</Typography.Paragraph>
        {snapshot && <Alert showIcon type="warning" message="Pengiriman sebelumnya belum dipastikan" description="Lakukan Coba Lagi. Jangan ambil foto baru selama status belum jelas." />}
        {error && <Alert showIcon type="error" message={error} />}
        {result && <Alert showIcon type="success" message="Absensi berhasil" description={<div><div>Tanggal: {result.attendanceDate}</div><div>Alamat tersimpan: {result.locationAddress ?? 'Belum tersedia; koordinat GPS telah tersimpan'}</div></div>} />}
        <Button type="primary" size="large" block loading={submitting} disabled={!photo || !photoLocation || compressing || cameraActive || Boolean(result)} icon={snapshot ? <ReloadOutlined /> : <EnvironmentOutlined />} onClick={() => void submit()}>
          {snapshot ? 'Coba Lagi' : 'Absen Sekarang'}
        </Button>
      </Space>
    </Card>
  </div>;
}
