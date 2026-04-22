import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { AuthProvider, RequireAuth } from './lib/auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Pipeline from './pages/Pipeline.jsx';
import ClientProfile from './pages/ClientProfile.jsx';
import Billing from './pages/Billing.jsx';
import Activity from './pages/Activity.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth><App /></RequireAuth>}>
            <Route index element={<Navigate to="/today" replace />} />
            <Route path="today" element={<Dashboard />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="clients/:id" element={<ClientProfile />} />
            <Route path="billing" element={<Billing />} />
            <Route path="activity" element={<Activity />} />
          </Route>
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
