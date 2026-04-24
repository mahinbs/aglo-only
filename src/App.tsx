import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/RequireAuth";
import { RequireSubscription } from "./components/RequireSubscription";
import { RequireTradingSession } from "./components/RequireTradingSession";
import BrokerCallbackPage from "./pages/BrokerCallbackPage";
import BrokerConnectPage from "./pages/BrokerConnectPage";
import DashboardPage from "./pages/DashboardPage";
import AccessRequestPage from "./pages/AccessRequestPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SessionTotpPage from "./pages/SessionTotpPage";
import TotpSetupPage from "./pages/TotpSetupPage";
import AdminPanelPage from "./pages/AdminPanelPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/request-access" element={<AccessRequestPage />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/session-totp"
          element={
            <RequireAuth>
              <SessionTotpPage />
            </RequireAuth>
          }
        />
        <Route
          path="/totp-setup"
          element={
            <RequireAuth>
              <TotpSetupPage />
            </RequireAuth>
          }
        />
        <Route path="/broker-callback" element={<BrokerCallbackPage />} />
        <Route
          path="/connect-broker"
          element={
            <RequireAuth>
              <RequireTradingSession>
                <BrokerConnectPage />
              </RequireTradingSession>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <RequireSubscription>
                <RequireTradingSession>
                  <DashboardPage />
                </RequireTradingSession>
              </RequireSubscription>
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <RequireSubscription>
                <RequireTradingSession>
                  <AdminPanelPage />
                </RequireTradingSession>
              </RequireSubscription>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
