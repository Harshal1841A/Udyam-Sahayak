import React, { useEffect, useState } from 'react';
import { getOfficerInfo, clearToken } from '../services/api';
import { getSyncQueueItems } from '../db/indexedDB';

interface HeaderBarProps {
  onNavigate: (view: string, params?: any) => void;
  currentView: string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({ onNavigate, currentView }) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const officer = getOfficerInfo();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkQueue = async () => {
      const items = await getSyncQueueItems();
      setPendingCount(items.length);
    };

    checkQueue();
    const interval = setInterval(checkQueue, 3000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleLogout = () => {
    clearToken();
    onNavigate('login');
  };

  if (currentView === 'login') return null;

  return (
    <header className="header-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', backgroundColor: 'var(--color-authority-navy)', color: '#FFFFFF', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, cursor: 'pointer' }} onClick={() => onNavigate('dashboard')}>
          Udyam Sahayak <span style={{ fontSize: '13px', fontWeight: 400, opacity: 0.85 }}>(Gate 3: Full Suite — Audio, Climate, Admin Dashboard)</span>
        </h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {/* Perspective Switcher */}
        <button
          onClick={() => onNavigate(currentView === 'admin_dashboard' ? 'dashboard' : 'admin_dashboard')}
          style={{
            backgroundColor: currentView === 'admin_dashboard' ? 'var(--color-accent-ochre)' : 'rgba(255, 255, 255, 0.15)',
            color: currentView === 'admin_dashboard' ? '#000000' : '#FFFFFF',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            padding: '8px 16px',
            borderRadius: '20px',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s',
          }}
        >
          {currentView === 'admin_dashboard' ? '👨‍🌾 Field Officer Portal' : '🏢 Institution Admin View'}
        </button>

        {/* Connection Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '999px', backgroundColor: isOnline ? 'var(--color-risk-low-bg)' : 'var(--color-risk-medium-bg)', color: isOnline ? 'var(--color-risk-low)' : 'var(--color-risk-medium)', fontWeight: 700, fontSize: '14px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: isOnline ? 'var(--color-risk-low)' : 'var(--color-risk-medium)' }}></span>
          {isOnline ? 'ONLINE' : 'OFFLINE MODE'}
          {pendingCount > 0 && (
            <span style={{ backgroundColor: 'var(--color-authority-navy)', color: '#FFF', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', marginLeft: '4px' }}>
              {pendingCount} pending
            </span>
          )}
        </div>

        {officer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 600, fontSize: '15px' }}>{officer.name}</div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>Vidarbha Gramin Bank</div>
            </div>
            <button
              onClick={handleLogout}
              style={{ backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#FFFFFF', padding: '8px 16px', minHeight: '40px', minWidth: '40px', fontSize: '14px', borderRadius: '6px', cursor: 'pointer' }}
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
