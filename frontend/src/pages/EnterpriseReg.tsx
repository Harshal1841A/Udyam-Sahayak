import React, { useState } from 'react';
import { getOfficerInfo } from '../services/api';
import { saveEnterpriseLocal, enqueueForSync } from '../db/indexedDB';
import type { Enterprise } from '../types';

interface EnterpriseRegProps {
  onNavigate: (view: string, params?: any) => void;
}

interface ClusterOption {
  id: string;
  name: string;
  icon: string;
  description: string;
}

const CLUSTERS: ClusterOption[] = [
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Dairy Cluster',
    icon: '🐄',
    description: 'Livestock scale, daily milk yield (liters), and monthly fodder expense.',
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Kirana / Rural Retail',
    icon: '🏪',
    description: 'Shop floor area (sq.ft.), unique SKUs count, and restock frequency.',
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    name: 'Handicraft Cluster',
    icon: '🧶',
    description: 'Active artisans count, looms/equipment count, and raw material cost.',
  },
];

export const EnterpriseReg: React.FC<EnterpriseRegProps> = ({ onNavigate }) => {
  const officer = getOfficerInfo();
  const [selectedClusterId, setSelectedClusterId] = useState<string>(CLUSTERS[0].id);
  const [ownerName, setOwnerName] = useState<string>('');
  const [village, setVillage] = useState<string>('Nagpur Rural');
  const [district, setDistrict] = useState<string>('Nagpur');
  const [state, setState] = useState<string>('Maharashtra');
  const [loading, setLoading] = useState<boolean>(false);

  const selectedCluster = CLUSTERS.find((c) => c.id === selectedClusterId) || CLUSTERS[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerName.trim()) return;

    setLoading(true);
    // Generate UUID v4 on-device for idempotency key
    const clientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

    const nowIso = new Date().toISOString();
    const enterprise: Enterprise = {
      client_id: clientId,
      institution_id: officer?.institution_id || '11111111-1111-1111-1111-111111111111',
      cluster_id: selectedClusterId,
      owner_name: ownerName.trim(),
      village: village.trim(),
      district: district.trim(),
      state: state.trim(),
      officer_id: officer?.id || '22222222-2222-2222-2222-222222222222',
      client_submitted_at: nowIso,
    };

    // Save to local IndexedDB
    await saveEnterpriseLocal(enterprise);

    // Enqueue for offline background sync
    await enqueueForSync({
      entity_type: 'enterprise',
      idempotency_key: clientId,
      payload: enterprise,
      queued_at: nowIso,
      retry_count: 0,
    });

    setLoading(false);
    onNavigate('consent_capture', { enterprise_id: clientId, owner_name: enterprise.owner_name });
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={() => onNavigate('dashboard')}
          style={{ background: 'none', border: 'none', color: 'var(--color-primary-forest)', fontWeight: 600, fontSize: '16px', cursor: 'pointer', padding: 0 }}
        >
          ← Back to Dashboard
        </button>
      </div>

      <div className="card">
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-authority-navy)', marginBottom: '8px' }}>
          Enterprise Registration (Gate 2: Multi-Cluster)
        </h1>
        <p style={{ fontSize: '16px', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
          Select the enterprise cluster type and fill in the farmer or shop owner's basic location and identity details.
        </p>

        {/* Cluster Selection Cards */}
        <div style={{ marginBottom: '28px' }}>
          <label style={{ display: 'block', fontWeight: 700, marginBottom: '12px', fontSize: '16px', color: 'var(--color-authority-navy)' }}>
            Select Enterprise Cluster *
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {CLUSTERS.map((cluster) => {
              const isSelected = selectedClusterId === cluster.id;
              return (
                <div
                  key={cluster.id}
                  onClick={() => setSelectedClusterId(cluster.id)}
                  style={{
                    border: isSelected ? '2px solid var(--color-primary-forest)' : '2px solid var(--color-border)',
                    backgroundColor: isSelected ? '#F0F7F4' : '#FFFFFF',
                    borderRadius: '12px',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isSelected ? '0 4px 12px rgba(27, 77, 62, 0.12)' : 'none',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '32px' }}>{cluster.icon}</span>
                      <div
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          border: isSelected ? '6px solid var(--color-primary-forest)' : '2px solid #CBD5E1',
                          backgroundColor: '#FFFFFF',
                        }}
                      />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '17px', color: isSelected ? 'var(--color-primary-forest)' : 'var(--color-authority-navy)', marginBottom: '6px' }}>
                      {cluster.name}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
                      {cluster.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderTop: '2px solid var(--color-border)', paddingTop: '24px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
              Farmer / Owner Full Name *
            </label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              required
              placeholder="e.g. Lakshman Singh"
              style={{ fontSize: '18px', padding: '12px 16px' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                Village / Panchayti
              </label>
              <input
                type="text"
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                placeholder="Village Name"
                style={{ fontSize: '16px', padding: '12px 16px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                District
              </label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="District Name"
                style={{ fontSize: '16px', padding: '12px 16px' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
              State
            </label>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="State Name"
              style={{ fontSize: '16px', padding: '12px 16px' }}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ marginTop: '16px', padding: '16px', fontSize: '18px' }}
          >
            {loading ? 'Saving to Device...' : `Save (${selectedCluster.name}) & Proceed to Consent \u2192`}
          </button>
        </form>
      </div>
    </div>
  );
};
