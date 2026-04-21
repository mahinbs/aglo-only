import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/RequireAuth";
import BrokerCallbackPage from "./pages/BrokerCallbackPage";
import BrokerConnectPage from "./pages/BrokerConnectPage";
import DashboardPage from "./pages/DashboardPage";
import AccessRequestPage from "./pages/AccessRequestPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/request-access" element={<AccessRequestPage />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/broker-callback" element={<BrokerCallbackPage />} />
        <Route
          path="/connect-broker"
          element={
            <RequireAuth>
              <BrokerConnectPage />
            </RequireAuth>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
