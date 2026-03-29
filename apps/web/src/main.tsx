import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./app/providers/ThemeProvider";
import { AuthProvider } from "./app/providers/AuthProvider";
import { GlobalNotificationProvider } from "./app/providers/GlobalNotificationProvider";
import { LocaleCurrencyProvider } from "./app/providers/LocaleCurrencyProvider";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <LocaleCurrencyProvider>
        <AuthProvider>
          <GlobalNotificationProvider>
            <App />
          </GlobalNotificationProvider>
        </AuthProvider>
      </LocaleCurrencyProvider>
    </ThemeProvider>
  </React.StrictMode>
);
