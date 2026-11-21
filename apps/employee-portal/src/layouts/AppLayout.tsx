import { useState } from "react";
import {
  Button,
  Drawer,
  Grid,
  Layout,
  Menu,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import {
  AppstoreOutlined,
  CalendarOutlined,
  LogoutOutlined,
  MenuOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import { getApiError } from "../shared/api/http";

const { Header, Content, Sider } = Layout;
const { useBreakpoint } = Grid;

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const mobile = !screens.md;
  const [open, setOpen] = useState(false);

  const items =
    user?.role === "HR"
      ? [
          {
            key: "/karyawan",
            icon: <TeamOutlined />,
            label: <Link to="/karyawan">Data Karyawan</Link>,
          },
          {
            key: "/monitoring",
            icon: <AppstoreOutlined />,
            label: <Link to="/monitoring">Monitoring Absensi</Link>,
          },
        ]
      : [
          {
            key: "/absen",
            icon: <CalendarOutlined />,
            label: <Link to="/absen">Absen WFH</Link>,
          },
          {
            key: "/riwayat",
            icon: <AppstoreOutlined />,
            label: <Link to="/riwayat">Riwayat Absensi</Link>,
          },
        ];

  async function signOut(): Promise<void> {
    try {
      await logout();
      navigate("/masuk", { replace: true });
    } catch (error) {
      message.error(getApiError(error));
    }
  }

  const menu = (
    <Menu
      className="main-menu"
      mode="inline"
      selectedKeys={[location.pathname]}
      items={items}
      onClick={() => setOpen(false)}
    />
  );

  return (
    <Layout className="app-shell">
      {!mobile && (
        <Sider width={240} theme="light" className="app-sidebar">
          <div className="brand">Absensi WFH</div>
          {menu}
        </Sider>
      )}
      <Drawer
        title="Absensi WFH"
        placement="left"
        open={mobile && open}
        onClose={() => setOpen(false)}
        width={265}
      >
        {menu}
      </Drawer>
      <Layout>
        <Header className="app-header">
          <Space size={12}>
            {mobile && (
              <Button
                aria-label="Buka menu"
                icon={<MenuOutlined />}
                onClick={() => setOpen(true)}
              />
            )}
            <Typography.Text strong>
              {mobile ? "Absensi WFH" : "Portal Karyawan"}
            </Typography.Text>
          </Space>
          <Space>
            {!mobile && (
              <Tag color="blue">{user?.role === "HR" ? "HR" : "Karyawan"}</Tag>
            )}
            <Button
              aria-label="Keluar"
              icon={<LogoutOutlined />}
              onClick={() => void signOut()}
            >
              {mobile ? "" : "Keluar"}
            </Button>
          </Space>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
