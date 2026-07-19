import React, { useState, useEffect } from 'react';
import { loginOfficer, getToken, getOfficerInfo, getActiveClusterModel } from '../services/api';

interface LoginProps {
  onNavigate: (view: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onNavigate }) => {
  const [phone, setPhone] = useState<string>('+919876543210');
  const [pin, setPin] = useState<string>('1234');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  useEffect(() => {
    // Check if already logged in locally
    const token = getToken();
    const officer = getOfficerInfo();
    if (token && officer) {
      onNavigate('dashboard');
    }

    const handleConnectionChange = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);
    return () => {
      window.removeEventListener('online', handleConnectionChange);
      window.removeEventListener('offline', handleConnectionChange);
    };
  }, [onNavigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isOffline) {
      // Offline fallback login check
      const token = getToken();
      const officer = getOfficerInfo();
      if (token && officer && officer.phone === phone) {
        setLoading(false);
        onNavigate('dashboard');
        return;
      } else if (phone === '+919876543210' && pin === '1234') {
        // Mock offline session for test officer if first boot offline
        localStorage.setItem('access_token', 'offline-jwt-mock-token-123');
        localStorage.setItem('officer_info', JSON.stringify({
          id: '22222222-2222-2222-2222-222222222222',
          institution_id: '11111111-1111-1111-1111-111111111111',
          name: 'Rajesh Kumar (Field Officer)',
          phone: '+919876543210',
          active: true,
        }));
        try {
          await getActiveClusterModel('33333333-3333-3333-3333-333333333333');
          await getActiveClusterModel('44444444-4444-4444-4444-444444444444');
          await getActiveClusterModel('55555555-5555-5555-5555-555555555555');
        } catch (e) {
          console.warn('Could not initialize offline fallback models:', e);
        }
        setLoading(false);
        onNavigate('dashboard');
        return;
      } else {
        setLoading(false);
        setError('Offline mode: Cannot verify new credentials without internet connection.');
        return;
      }
    }

    try {
      await loginOfficer(phone, pin);
      setLoading(false);
      onNavigate('dashboard');
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Login failed. Please check your phone number and PIN.');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '24px', backgroundColor: 'var(--color-bg-page)' }}>
      <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '36px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--color-primary-forest)', color: '#FFF', fontSize: '28px', fontWeight: 'bold', marginBottom: '16px' }}>
            ₹
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-authority-navy)', marginBottom: '8px' }}>
            Udyam Sahayak
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--color-text-muted)' }}>
            Field Officer Portal — Gate 1 (Dairy Cluster)
          </p>
        </div>

        {isOffline && (
          <div style={{ padding: '12px 16px', backgroundColor: 'var(--color-risk-medium-bg)', border: '2px solid var(--color-risk-medium)', borderRadius: '8px', color: 'var(--color-risk-medium)', fontWeight: 600, fontSize: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠ Offline Mode: Login will use locally cached credentials.</span>
          </div>
        )}

        {error && (
          <div style={{ padding: '12px 16px', backgroundColor: 'var(--color-risk-high-bg)', border: '2px solid var(--color-risk-high)', borderRadius: '8px', color: 'var(--color-risk-high)', fontWeight: 600, fontSize: '15px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
              Officer Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="+919876543210"
              style={{ fontSize: '18px', padding: '12px 16px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
              4-Digit PIN
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
              maxLength={6}
              placeholder="••••"
              style={{ fontSize: '24px', letterSpacing: '4px', padding: '12px 16px' }}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ marginTop: '12px', width: '100%', fontSize: '18px', padding: '14px' }}
          >
            {loading ? 'Authenticating...' : 'Secure Officer Login \u2192'}
          </button>
        </form>

        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--color-border)', textAlign: 'center', fontSize: '14px', color: 'var(--color-text-muted)' }}>
          <div>Test Officer Phone: <strong>+919876543210</strong></div>
          <div>Test PIN: <strong>1234</strong></div>
        </div>
      </div>
    </div>
  );
};
