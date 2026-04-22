import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import Login from './pages/Login.jsx';
import DayFlow from './pages/DayFlow.jsx';
import Clients from './pages/Clients.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Activity from './pages/Activity.jsx';
import Digest from './pages/Digest.jsx';
import SaveQueue from './pages/SaveQueue.jsx';
import Billing from './pages/Billing.jsx';
import Flags from './pages/Flags.jsx';
import Reports from './pages/Reports.jsx';
import SettingsPage from './pages/Settings.jsx';
import NotFound from './pages/NotFound.jsx';
import SlackPulse from './pages/SlackPulse.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Retention from './pages/Retention.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ClientProfile from './pages/ClientProfile.jsx';
import { AuthProvider, RequireAuth } from './lib/auth.jsx';
import { RoleProvider, useRole } from './lib/role.jsx';
import { DataProvider } from './lib/data.jsx';
import { ToastProvider } from './lib/toast.jsx';

function RequireFinancial({ children }) {
  const { canSeeFinancials, loading } = useRole();
  if (loading) return null;
  if (!canSeeFinancials) return <Navigate to="/" replace />;
  return children;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={
                <RequireAuth>
                  <RoleProvider>
                    <DataProvider>
                      <App />
                    </DataProvider>
                  </RoleProvider>
                </RequireAuth>
              }>
                {/* Ops-visible routes */}
                <Route path="/" element={<DayFlow />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/clients/:id" element={<ClientProfile />} />
                <Route path="/pipeline" element={<Pipeline />} />
                <Route path="/activity" element={<Activity />} />
                <Route path="/slack-pulse" element={<SlackPulse />} />
                <Route path="/settings" element={<SettingsPage />} />
                {/* Financial/retention routes - admin + retention only */}
                <Route path="/billing" element={<RequireFinancial><Billing /></RequireFinancial>} />
                <Route path="/save-queue" element={<RequireFinancial><SaveQueue /></RequireFinancial>} />
                <Route path="/flags" element={<RequireFinancial><Flags /></RequireFinancial>} />
                <Route path="/digest" element={<RequireFinancial><Digest /></RequireFinancial>} />
                <Route path="/retention" element={<RequireFinancial><Retention /></RequireFinancial>} />
                <Route path="/dashboard" element={<RequireFinancial><Dashboard /></RequireFinancial>} />
                <Route path="/reports" element={<RequireFinancial><Reports /></RequireFinancial>} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
