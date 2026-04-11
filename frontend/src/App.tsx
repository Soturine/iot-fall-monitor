import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import { RealtimeProvider } from "./contexts/RealtimeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ui/ProtectedRoute";
import { LoadingState } from "./components/ui/LoadingState";

const AppLayout = lazy(() =>
  import("./components/layout/AppLayout").then((module) => ({ default: module.AppLayout })),
);
const AlertsPage = lazy(() =>
  import("./pages/AlertsPage").then((module) => ({ default: module.AlertsPage })),
);
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const DeviceDetailPage = lazy(() =>
  import("./pages/DeviceDetailPage").then((module) => ({ default: module.DeviceDetailPage })),
);
const DevicesPage = lazy(() =>
  import("./pages/DevicesPage").then((module) => ({ default: module.DevicesPage })),
);
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage })),
);
const OrganizationPage = lazy(() =>
  import("./pages/OrganizationPage").then((module) => ({ default: module.OrganizationPage })),
);
const PatientsPage = lazy(() =>
  import("./pages/PatientsPage").then((module) => ({ default: module.PatientsPage })),
);

const routeFallback = <LoadingState label="Carregando tela..." />;

function App() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <BrowserRouter>
          <Suspense fallback={routeFallback}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate replace to="/dashboard" />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/patients" element={<PatientsPage />} />
                <Route path="/devices" element={<DevicesPage />} />
                <Route path="/devices/:id" element={<DeviceDetailPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/organization" element={<OrganizationPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              borderRadius: "18px",
              background: "#17322a",
              color: "#f6f7f4",
            },
          }}
        />
      </RealtimeProvider>
    </AuthProvider>
  );
}

export default App;
