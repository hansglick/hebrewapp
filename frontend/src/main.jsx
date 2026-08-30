import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { ConfigProvider } from "./config/ConfigContext.jsx";
import { ExamTimerProvider } from "./context/ExamTimerContext.jsx";
import { WalletProvider } from "./context/WalletContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ConfigProvider>
      <ExamTimerProvider>
        <WalletProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </WalletProvider>
      </ExamTimerProvider>
    </ConfigProvider>
  </StrictMode>
);
