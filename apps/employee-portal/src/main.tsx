import React from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import idID from "antd/locale/id_ID";
import App from "./app/App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={idID}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
