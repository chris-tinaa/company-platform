import { ConfigProvider, Spin } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth, type User } from "./AuthProvider";
import AppLayout from "../layouts/AppLayout";
import LoginPage from "../modules/auth/LoginPage";
import CheckInPage from "../modules/attendance/CheckInPage";
import HistoryPage from "../modules/attendance/HistoryPage";
import HRReportPage from "../modules/attendance/HRReportPage";
import EmployeeDirectoryPage from "../modules/employee/EmployeeDirectoryPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

function Protected({ role }: { role?: User["role"] }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="loading-screen">
        <Spin size="large" tip="Loading..." />
      </div>
    );
  if (!user) return <Navigate to="/masuk" replace />;
  if (role && user.role !== role)
    return (
      <Navigate to={user.role === "HR" ? "/karyawan" : "/absen"} replace />
    );
  return <AppLayout />;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="loading-screen">
        <Spin size="large" />
      </div>
    );
  return (
    <Navigate
      to={user?.role === "HR" ? "/karyawan" : user ? "/absen" : "/masuk"}
      replace
    />
  );
}

export default function App() {
  return (
    <ConfigProvider
      theme={{ token: { colorPrimary: "#0057C2", borderRadius: 10 } }}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/masuk" element={<LoginPage />} />
              <Route element={<Protected />}>
                <Route path="/" element={<Home />} />
              </Route>
              <Route element={<Protected role="EMPLOYEE" />}>
                <Route path="/absen" element={<CheckInPage />} />
                <Route path="/riwayat" element={<HistoryPage />} />
              </Route>
              <Route element={<Protected role="HR" />}>
                <Route path="/karyawan" element={<EmployeeDirectoryPage />} />
                <Route path="/monitoring" element={<HRReportPage />} />
              </Route>
              <Route path="*" element={<Home />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ConfigProvider>
  );
}
