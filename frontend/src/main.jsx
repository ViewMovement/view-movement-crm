import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import Login from './pages/Login.jsx';
import Today from './pages/Today.jsx';
import Clients from './pages/Clients.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Activity from './pages/Activity.jsx';
import Digest from './pages/Digest.jsx';
import ClientProfile from './pages/ClientProfile.jsx';
import { AuthProvider, RequireAuth } from './lib/auth.jsx';
import { DataProvider } from './lib/data.jsx';
import { ToastProvider } from './lib/toast.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
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
              <Route path="/" element={<Today />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/clients/:id" element={<ClientProfile />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/digest" element={<Digest />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
