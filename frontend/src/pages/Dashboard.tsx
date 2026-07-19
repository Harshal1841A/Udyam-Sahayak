import React, { useState, useEffect } from 'react';
import { getOfficerInfo } from '../services/api';
import { syncOfflineQueue } from '../services/syncService';
import type { SyncSummary } from '../services/syncService';
import { getAllEnterprisesLocal, getDraftProxyRecords } from '../db/indexedDB';
import type { Enterprise, ProxyRecord } from '../types';

interface DashboardProps {
  onNavigate: (view: string, params?: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [draftProxies, setDraftProxies] = useState<ProxyRecord[]>([]);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<SyncSummary | null>(null);
  const [syncError, setSyncError] = useState<string>('');
  const officer = getOfficerInfo();

  const loadLocalData = async () => {
    const ents = await getAllEnterprisesLocal();
    const drafts = await getDraftProxyRecords();
    setEnterprises(ents);
    setDraftProxies(drafts);
  };

  useEffect(() => {
    loadLocalData();
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncError('');
    setSyncResult(null);
    try {
      const summary = await syncOfflineQueue();
      setSyncResult(summary);
      await loadLocalData();
    } catch (err: any) {
      setSyncError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const getClusterName = (clusterId?: string) => {
    if (!clusterId) return 'Dairy Cluster';
    if (clusterId === '44444444-4444-4444-4444-444444444444' || clusterId.includes('Kirana')) return 'Kirana / Rural Retail';
    if (clusterId === '55555555-5555-5555-5555-555555555555' || clusterId.includes('Handicraft')) return 'Handicraft Cluster';
    return 'Dairy Cluster';
  };

  const getProxySummary = (proxy: ProxyRecord, ent?: Enterprise) => {
    const p = proxy.physical_proxies as any;
    if (!p) return `Visit Date: ${proxy.visit_date}`;
    const cName = getClusterName(ent?.cluster_id);
    if (cName.includes('Kirana')) {
      return `Visit Date: ${proxy.visit_date} | Area: ${p.floor_area_sqft || 0} sq.ft | SKUs: ${p.skus_count || 0}`;
    }
    if (cName.includes('Handicraft')) {
      return `Visit Date: ${proxy.visit_date} | Artisans: ${p.artisans_count || 0} | Looms: ${p.looms_equipment_count || 0}`;
    }
    return `Visit Date: ${proxy.visit_date} | Livestock: ${p.livestock_count || 0} | Milk: ${p.milk_volume_l_day || 0} L/day`;
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Welcome & Quick Action Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-authority-navy)', marginBottom: '8px' }}>
            Welcome back, {officer?.name || 'Field Officer'}
          </h1>
          <p style={{ fontSize: '18px', color: 'var(--color-text-secondary)' }}>
            Vidarbha Gramin Bank — Multi-Cluster Assessment Portal
          </p>
        </div>

        <div style={{ display: 'flex', gap: '16px' }}>
          <button
            onClick={handleSyncNow}
            disabled={syncing || !navigator.onLine}
            className="btn-secondary"
            style={{ padding: '12px 20px' }}
          >
            {syncing ? 'Syncing...' : '↻ Sync Offline Queue'}
          </button>
          <button
            onClick={() => onNavigate('enterprise_reg')}
            className="btn-primary"
            style={{ padding: '12px 24px', fontSize: '18px' }}
          >
            + New Client Assessment
          </button>
        </div>
      </div>

      {/* Sync Status Feedback */}
      {syncResult && (
        <div className="card" style={{ marginBottom: '24px', borderLeft: '6px solid var(--color-primary-forest)', backgroundColor: 'var(--color-risk-low-bg)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-risk-low)', marginBottom: '8px' }}>
            Sync Complete: {syncResult.synced} Synced, {syncResult.conflicts} Conflicts, {syncResult.errors} Errors
          </h3>
          {syncResult.messages.map((msg, i) => (
            <div key={i} style={{ fontSize: '15px', color: 'var(--color-text-primary)' }}>{msg}</div>
          ))}
        </div>
      )}

      {syncError && (
        <div className="card" style={{ marginBottom: '24px', borderLeft: '6px solid var(--color-risk-high)', backgroundColor: 'var(--color-risk-high-bg)', color: 'var(--color-risk-high)', fontWeight: 600 }}>
          {syncError}
        </div>
      )}

      {/* Drafts in Progress */}
      <div className="card" style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-authority-navy)', marginBottom: '16px', borderBottom: '2px solid var(--color-border)', paddingBottom: '12px' }}>
          Draft & In-Progress Assessments ({draftProxies.length})
        </h2>
        {draftProxies.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '16px', fontStyle: 'italic' }}>
            No draft assessments in progress. Click "+ New Client Assessment" to start.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {draftProxies.map((proxy) => {
              const ent = enterprises.find((e) => e.id === proxy.enterprise_id || e.client_id === proxy.enterprise_id);
              return (
                <div
                  key={proxy.client_record_uuid}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: 'var(--color-bg-page)', borderRadius: '10px', border: '1px solid var(--color-border)' }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--color-authority-navy)' }}>
                      {ent?.owner_name || 'Assessment Draft'}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                      {getProxySummary(proxy, ent)}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (proxy.bounds_validated) {
                        onNavigate('forecast', { record_uuid: proxy.client_record_uuid });
                      } else {
                        onNavigate('proxy_form', { enterprise_id: proxy.enterprise_id, record_uuid: proxy.client_record_uuid });
                      }
                    }}
                    className="btn-accent"
                    style={{ padding: '8px 18px', fontSize: '16px' }}
                  >
                    Resume Assessment &rarr;
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Local Enterprises / Synced History */}
      <div className="card">
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-authority-navy)', marginBottom: '16px', borderBottom: '2px solid var(--color-border)', paddingBottom: '12px' }}>
          Local Client Enterprises ({enterprises.length})
        </h2>
        {enterprises.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '16px', fontStyle: 'italic' }}>
            No enterprises registered locally yet.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {enterprises.map((ent) => (
              <div
                key={ent.client_id}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: 'var(--color-bg-page)', borderRadius: '10px', border: '1px solid var(--color-border)' }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--color-authority-navy)' }}>
                    {ent.owner_name}
                  </div>
                  <div style={{ fontSize: '15px', color: 'var(--color-text-secondary)' }}>
                    {ent.village || 'Village not specified'}, {ent.district || 'Nagpur'} | Cluster: <strong>{getClusterName(ent.cluster_id)}</strong>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className={`status-badge ${ent.server_received_at ? 'low' : 'medium'}`}>
                    {ent.server_received_at ? '✓ Synced' : '⏳ Pending Sync'}
                  </span>
                  <button
                    onClick={() => onNavigate('proxy_form', { enterprise_id: ent.client_id })}
                    className="btn-secondary"
                    style={{ padding: '8px 16px', fontSize: '15px' }}
                  >
                    New Assessment
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
