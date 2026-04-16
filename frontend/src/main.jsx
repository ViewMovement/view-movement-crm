import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import Login from './pages/Login.jsx';
import Triage from './pages/Triage.jsx';
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
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ClientProfile from './pages/ClientProfile.jsx';
import { AuthProvider, RequireAuth } from './lib/auth.jsx';
import { DataProvider } from './lib/data.jsx';
import { ToastProvider } from './lib/toast.jsx';

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
                <DataProvider>
                  <App />
                </DataProvider>
              </RequireAuth>
            }>
              <Route path="/" element={<DayFlow />} />
              <Route path="/board" element={<Triage />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/clients/:id" element={<ClientProfile />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/save-queue" element={<SaveQueue />} />
              <Route path="/flags" element={<Flags />} />
              <Route path="/digest" element={<Digest />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/slack-pulse" element={<SlackPulse />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
