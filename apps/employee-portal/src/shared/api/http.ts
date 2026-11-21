import axios from "axios";

export const api = axios.create({
  baseURL: "/api/v1",
  withCredentials: true,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  if (
    ["post", "put", "patch", "delete"].includes(
      config.method?.toLowerCase() ?? "",
    )
  ) {
    config.headers.set("X-Requested-With", "attendance-portal");
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      window.dispatchEvent(new Event("attendance-session-expired"));
    }
    return Promise.reject(error);
  },
);

export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (typeof data?.message === "string") return data.message;
    if (error.code === "ECONNABORTED")
      return "Permintaan terlalu lama. Coba lagi.";
    if (!error.response)
      return "Tidak dapat terhubung ke server. Periksa koneksi internet.";
  }
  return "Terjadi kesalahan. Coba lagi.";
}
