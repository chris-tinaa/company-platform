import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/v1/auth": "http://127.0.0.1:3001",
      "/api/v1/employees": "http://127.0.0.1:3002",
      "/api/v1/attendance": "http://127.0.0.1:3003",
      "/api/v1/documents": "http://127.0.0.1:3004",
    },
  },
});
