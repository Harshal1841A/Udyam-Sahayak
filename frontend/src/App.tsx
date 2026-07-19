import React, { useState } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { EnterpriseReg } from './pages/EnterpriseReg';
import { ConsentCapture } from './pages/ConsentCapture';
import { ProxyForm } from './pages/ProxyForm';
import { Forecast } from './pages/Forecast';
import { AdminDashboard } from './pages/AdminDashboard';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<string>('login');
  const [viewParams, setViewParams] = useState<any>({});

  const handleNavigate = (view: string, params: any = {}) => {
    setViewParams(params);
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <HeaderBar onNavigate={handleNavigate} currentView={currentView} />
      <main style={{ flex: 1 }}>
        {currentView === 'login' && <Login onNavigate={handleNavigate} />}
        {currentView === 'dashboard' && <Dashboard onNavigate={handleNavigate} />}
        {currentView === 'admin_dashboard' && <AdminDashboard onNavigate={handleNavigate} />}
        {currentView === 'enterprise_reg' && <EnterpriseReg onNavigate={handleNavigate} />}
        {currentView === 'consent_capture' && (
          <ConsentCapture
            onNavigate={handleNavigate}
            enterpriseId={viewParams.enterprise_id || ''}
            ownerName={viewParams.owner_name || 'Dairy Farmer'}
          />
        )}
        {currentView === 'proxy_form' && (
          <ProxyForm
            onNavigate={handleNavigate}
            enterpriseId={viewParams.enterprise_id || ''}
            recordUuid={viewParams.record_uuid}
          />
        )}
        {currentView === 'forecast' && (
          <Forecast
            onNavigate={handleNavigate}
            recordUuid={viewParams.record_uuid || ''}
          />
        )}
      </main>
    </div>
  );
};

export default App;
