import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./app/providers/ThemeProvider";
import { AuthProvider } from "./app/providers/AuthProvider";
import { GlobalNotificationProvider } from "./app/providers/GlobalNotificationProvider";
import { LocaleCurrencyProvider } from "./app/providers/LocaleCurrencyProvider";
import { MarketPreferenceProvider } from "./app/providers/MarketPreferenceProvider";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <MarketPreferenceProvider>
        <LocaleCurrencyProvider>
          <AuthProvider>
            <GlobalNotificationProvider>
              <App />
            </GlobalNotificationProvider>
          </AuthProvider>
        </LocaleCurrencyProvider>
      </MarketPreferenceProvider>
    </ThemeProvider>
  </React.StrictMode>
);
