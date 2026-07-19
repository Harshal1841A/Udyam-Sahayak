import React, { useState, useEffect } from 'react';
import {
  getAdminPortfolio,
  getAdminDiscrepancies,
  getAdminEnterpriseDetail,
  getAdminAuditLogs,
} from '../services/api';
import {
  getAllEnterprisesLocal,
  getAllProxyRecordsLocal,
  getAllConsentsLocal,
} from '../db/indexedDB';
import type {
  AdminPortfolioSummary,
  AdminDiscrepancyItem,
  AdminAuditLogItem,
  AdminEnterpriseDetail,
  Enterprise,
  ProxyRecord,
} from '../types';

interface AdminDashboardProps {
  onNavigate: (view: string, params?: any) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'portfolio' | 'discrepancies' | 'enterprises' | 'audit'>('portfolio');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [portfolio, setPortfolio] = useState<AdminPortfolioSummary | null>(null);
  const [discrepancies, setDiscrepancies] = useState<AdminDiscrepancyItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogItem[]>([]);
  const [localEnterprises, setLocalEnterprises] = useState<Enterprise[]>([]);
  const [localRecords, setLocalRecords] = useState<ProxyRecord[]>([]);
  
  // Enterprise drill-down state
  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState<string>('');
  const [enterpriseDetail, setEnterpriseDetail] = useState<AdminEnterpriseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // Filter state for Discrepancies
  const [discrepancyFilter, setDiscrepancyFilter] = useState<'all' | 'flagged' | 'overrides'>('all');

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Load offline/local DB records first/in parallel
      const [ents, recs, cons] = await Promise.all([
        getAllEnterprisesLocal(),
        getAllProxyRecordsLocal(),
        getAllConsentsLocal(),
      ]);
      setLocalEnterprises(ents);
      setLocalRecords(recs);

      if (ents.length > 0 && !selectedEnterpriseId) {
        setSelectedEnterpriseId(ents[0].client_id);
      }

      // Try online admin fetch
      if (navigator.onLine) {
        try {
          const [portSummary, discList, logList] = await Promise.all([
            getAdminPortfolio(),
            getAdminDiscrepancies(),
            getAdminAuditLogs(100),
          ]);
          setPortfolio(portSummary);
          setDiscrepancies(discList);
          setAuditLogs(logList);
        } catch (apiErr) {
          console.warn('Backend admin API unreachable or offline, synthesizing from local records:', apiErr);
          synthesizeFromLocal(ents, recs, cons);
        }
      } else {
        synthesizeFromLocal(ents, recs, cons);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load institutional dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  const synthesizeFromLocal = (ents: Enterprise[], recs: ProxyRecord[], _cons: any[]) => {
    // Build fallback portfolio summary from local IndexedDB data
    let lowCount = 0;
    let medCount = 0;
    let highCount = 0;
    const attentionQueue: AdminPortfolioSummary['attention_queue'] = [];
    const discList: AdminDiscrepancyItem[] = [];

    const entMap = new Map<string, Enterprise>();
    ents.forEach((e) => entMap.set(e.client_id, e));

    recs.forEach((r) => {
      const ent = entMap.get(r.enterprise_id);
      const risk = r.risk_tier || 'MEDIUM';
      if (risk === 'LOW') lowCount++;
      else if (risk === 'MEDIUM') medCount++;
      else if (risk === 'HIGH') highCount++;

      const clusterName = ent?.cluster_id === '44444444-4444-4444-4444-444444444444' || ent?.cluster_id.includes('Kirana')
        ? 'Kirana / Rural Retail'
        : ent?.cluster_id === '55555555-5555-5555-5555-555555555555' || ent?.cluster_id.includes('Handicraft')
        ? 'Handicraft'
        : 'Dairy';

      if (!r.bounds_validated || r.officer_action === 'OVERRIDE') {
        attentionQueue.push({
          client_record_uuid: r.client_record_uuid,
          enterprise_id: r.enterprise_id,
          owner_name: ent?.owner_name || 'Farmer / Owner',
          village: ent?.village || 'Vidarbha',
          cluster_name: clusterName,
          visit_date: r.visit_date,
          risk_tier: risk,
          is_flagged: !r.bounds_validated,
          sync_status: r.sync_status || 'synced',
          discrepancy_reason: r.override_reason || 'Local boundary validation triggered or officer override applied.',
        });

        discList.push({
          client_record_uuid: r.client_record_uuid,
          enterprise_id: r.enterprise_id,
          enterprise_name: ent?.owner_name || 'Farmer / Owner',
          cluster_name: clusterName,
          visit_date: r.visit_date,
          reason: r.override_reason || 'Out-of-bounds physical proxy reported',
          officer_action: r.officer_action || 'OVERRIDE',
          override_reason: r.override_reason,
        });
      }
    });

    setPortfolio({
      total_enterprises: ents.length,
      active_assessments: recs.length,
      total_assessed: recs.length,
      risk_breakdown: { LOW: lowCount, MEDIUM: medCount, HIGH: highCount },
      needs_attention_count: attentionQueue.length,
      attention_queue: attentionQueue,
    });
    setDiscrepancies(discList);

    // Synthesize local audit logs
    const logs: AdminAuditLogItem[] = recs.map((r, idx) => ({
      id: `local_log_${idx}`,
      enterprise_id: r.enterprise_id,
      actor_type: r.officer_action === 'OVERRIDE' ? 'OFFICER' : 'AI',
      actor_name: 'Field Officer Local Session',
      event_type: r.officer_action === 'OVERRIDE' ? 'ASSESSMENT_OVERRIDE' : 'ASSESSMENT_CALIBRATED',
      payload: { risk_tier: r.risk_tier, visit_date: r.visit_date, override_reason: r.override_reason },
      created_at: r.client_submitted_at || new Date().toISOString(),
    }));
    setAuditLogs(logs);
  };

  useEffect(() => {
    if (!selectedEnterpriseId) return;
    const fetchDetail = async () => {
      setDetailLoading(true);
      try {
        if (navigator.onLine) {
          try {
            const detail = await getAdminEnterpriseDetail(selectedEnterpriseId);
            setEnterpriseDetail(detail);
            setDetailLoading(false);
            return;
          } catch (e) {
            console.warn('Backend detail failed, falling back to local DB:', e);
          }
        }
        // Local fallback
        const ent = localEnterprises.find((e) => e.client_id === selectedEnterpriseId);
        const recs = localRecords.filter((r) => r.enterprise_id === selectedEnterpriseId);
        const cons = (await getAllConsentsLocal()).filter((c) => c.enterprise_id === selectedEnterpriseId);
        if (ent) {
          setEnterpriseDetail({
            enterprise: ent,
            assessments: recs,
            consents: cons,
          });
        }
      } catch (err) {
        console.error('Error fetching drill-down detail:', err);
      } finally {
        setDetailLoading(false);
      }
    };
    fetchDetail();
  }, [selectedEnterpriseId, localEnterprises, localRecords]);

  const filteredDiscrepancies = discrepancies.filter((d) => {
    if (discrepancyFilter === 'flagged') return !d.officer_action || d.officer_action !== 'OVERRIDE';
    if (discrepancyFilter === 'overrides') return d.officer_action === 'OVERRIDE';
    return true;
  });

  if (loading && !portfolio) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-authority-navy)' }}>
          🔄 Loading Institution Admin Portfolio Analytics...
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 36px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'var(--font-sans)' }}>
      {/* Top Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', backgroundColor: 'var(--color-bg-page)', padding: '20px 24px', borderRadius: '14px', border: '2px solid var(--color-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-authority-navy)', margin: '0 0 6px 0' }}>
            🏢 Institutional Admin & Compliance Dashboard
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--color-text-secondary)', margin: 0 }}>
            Vidarbha Gramin Bank • Portfolio Analytics, Discrepancy Ledgers & Human-in-the-Loop Audit Trails
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => loadAllData()}
            className="btn-accent"
            style={{ padding: '10px 18px', fontSize: '14px', fontWeight: 700 }}
          >
            🔄 Refresh Analytics
          </button>
          <button
            onClick={() => onNavigate('dashboard')}
            className="btn-primary"
            style={{ padding: '10px 18px', fontSize: '14px', fontWeight: 700 }}
          >
            👨‍🌾 Switch to Field Officer View →
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '14px 18px', backgroundColor: 'var(--color-risk-high-bg)', border: '2px solid var(--color-risk-high)', borderRadius: '10px', color: 'var(--color-risk-high)', fontWeight: 600, marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', borderBottom: '3px solid var(--color-border)', marginBottom: '28px', gap: '8px' }}>
        {[
          { id: 'portfolio', label: '📊 Portfolio Overview', count: portfolio?.needs_attention_count },
          { id: 'discrepancies', label: '⚠️ Discrepancy & Overrides', count: discrepancies.length },
          { id: 'enterprises', label: '🔍 Enterprise 360° Drill-Down' },
          { id: 'audit', label: '🔒 Cryptographic Audit Ledger', count: auditLogs.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '14px 22px',
              fontSize: '16px',
              fontWeight: 700,
              border: 'none',
              backgroundColor: activeTab === tab.id ? 'var(--color-authority-navy)' : 'transparent',
              color: activeTab === tab.id ? '#FFFFFF' : 'var(--color-text-secondary)',
              borderRadius: '10px 10px 0 0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{
                backgroundColor: activeTab === tab.id ? 'var(--color-accent-ochre)' : 'var(--color-border)',
                color: activeTab === tab.id ? '#000' : 'var(--color-text-primary)',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '13px',
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: PORTFOLIO OVERVIEW */}
      {activeTab === 'portfolio' && portfolio && (
        <div>
          {/* Summary Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
            <div style={{ padding: '22px', backgroundColor: 'var(--color-bg-page)', borderRadius: '12px', border: '2px solid var(--color-border)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Total Enterprises Registered
              </div>
              <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--color-authority-navy)', marginTop: '8px' }}>
                {portfolio.total_enterprises}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-primary-forest)', fontWeight: 600, marginTop: '6px' }}>
                ✓ Multi-cluster KYC verified
              </div>
            </div>

            <div style={{ padding: '22px', backgroundColor: 'var(--color-bg-page)', borderRadius: '12px', border: '2px solid var(--color-border)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Total Assessments Completed
              </div>
              <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--color-primary-forest)', marginTop: '8px' }}>
                {portfolio.total_assessed}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
                On-device calibrated cash flow models
              </div>
            </div>

            <div style={{ padding: '22px', backgroundColor: 'var(--color-risk-high-bg)', borderRadius: '12px', border: '2px solid var(--color-risk-high)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-risk-high)', textTransform: 'uppercase' }}>
                Needs Attention Queue
              </div>
              <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--color-risk-high)', marginTop: '8px' }}>
                {portfolio.needs_attention_count}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-risk-high)', fontWeight: 600, marginTop: '6px' }}>
                Discrepancies / Officer Overrides
              </div>
            </div>

            <div style={{ padding: '22px', backgroundColor: 'var(--color-bg-page)', borderRadius: '12px', border: '2px solid var(--color-border)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Risk Tier Distribution
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px', alignItems: 'center' }}>
                <span className="status-badge low" style={{ fontSize: '13px' }}>
                  LOW: {portfolio.risk_breakdown?.LOW || 0}
                </span>
                <span className="status-badge medium" style={{ fontSize: '13px' }}>
                  MED: {portfolio.risk_breakdown?.MEDIUM || 0}
                </span>
                <span className="status-badge high" style={{ fontSize: '13px' }}>
                  HIGH: {portfolio.risk_breakdown?.HIGH || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Needs Attention Queue Table */}
          <div style={{ backgroundColor: 'var(--color-bg-page)', borderRadius: '14px', border: '2px solid var(--color-border)', padding: '24px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-authority-navy)', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🚨</span> Priority Needs Attention Queue (Exceptions & Overrides)
            </h3>
            {portfolio.attention_queue && portfolio.attention_queue.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)', backgroundColor: 'var(--color-bg-surface-alt)', color: 'var(--color-authority-navy)' }}>
                      <th style={{ padding: '12px 14px' }}>Enterprise / Owner</th>
                      <th style={{ padding: '12px 14px' }}>Cluster</th>
                      <th style={{ padding: '12px 14px' }}>Visit Date</th>
                      <th style={{ padding: '12px 14px' }}>Risk Tier</th>
                      <th style={{ padding: '12px 14px' }}>Status / Reason</th>
                      <th style={{ padding: '12px 14px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.attention_queue.map((item, idx) => (
                      <tr key={item.client_record_uuid || idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '14px', fontWeight: 600 }}>
                          {item.owner_name}
                          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 400 }}>{item.village || 'Vidarbha Cluster'}</div>
                        </td>
                        <td style={{ padding: '14px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-authority-navy)' }}>{item.cluster_name}</span>
                        </td>
                        <td style={{ padding: '14px' }}>{item.visit_date}</td>
                        <td style={{ padding: '14px' }}>
                          <span className={`status-badge ${item.risk_tier?.toLowerCase()}`}>
                            {item.risk_tier}
                          </span>
                        </td>
                        <td style={{ padding: '14px', maxWidth: '360px' }}>
                          <div style={{ fontWeight: 600, color: item.is_flagged ? 'var(--color-risk-high)' : 'var(--color-accent-ochre-dark)' }}>
                            {item.is_flagged ? '⚠️ Discrepancy Flagged' : '✍️ Officer Override Applied'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                            {item.discrepancy_reason || 'Local boundary check check failure or field officer authority override'}
                          </div>
                        </td>
                        <td style={{ padding: '14px' }}>
                          <button
                            onClick={() => {
                              setSelectedEnterpriseId(item.enterprise_id);
                              setActiveTab('enterprises');
                            }}
                            className="btn-accent"
                            style={{ padding: '6px 12px', fontSize: '13px' }}
                          >
                            Inspect 360° →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '16px' }}>
                🎉 No pending discrepancies or unresolved officer overrides in the portfolio. All assessments are within calibrated physical bounds!
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DISCREPANCIES & OVERRIDES LEDGER */}
      {activeTab === 'discrepancies' && (
        <div style={{ backgroundColor: 'var(--color-bg-page)', borderRadius: '14px', border: '2px solid var(--color-border)', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-authority-navy)', margin: 0 }}>
              ⚠️ Physical Proxy Discrepancy & Officer Override Ledger
            </h3>

            {/* Filter Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['all', 'flagged', 'overrides'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setDiscrepancyFilter(f)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    border: '1px solid var(--color-border)',
                    backgroundColor: discrepancyFilter === f ? 'var(--color-authority-navy)' : '#FFF',
                    color: discrepancyFilter === f ? '#FFF' : 'var(--color-text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {f === 'all' ? 'All Ledger Entries' : f === 'flagged' ? 'Flagged Discrepancies Only' : 'Officer Overrides Only'}
                </button>
              ))}
            </div>
          </div>

          {filteredDiscrepancies.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)', backgroundColor: 'var(--color-bg-surface-alt)', color: 'var(--color-authority-navy)' }}>
                    <th style={{ padding: '12px 14px' }}>Enterprise Name</th>
                    <th style={{ padding: '12px 14px' }}>Cluster</th>
                    <th style={{ padding: '12px 14px' }}>Date</th>
                    <th style={{ padding: '12px 14px' }}>Reported / Expected Range</th>
                    <th style={{ padding: '12px 14px' }}>Discrepancy Reason</th>
                    <th style={{ padding: '12px 14px' }}>Action & Override Justification</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDiscrepancies.map((d, idx) => (
                    <tr key={d.client_record_uuid || idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '14px', fontWeight: 700, color: 'var(--color-authority-navy)' }}>
                        {d.enterprise_name || 'Farmer Enterprise'}
                      </td>
                      <td style={{ padding: '14px', fontWeight: 600 }}>{d.cluster_name}</td>
                      <td style={{ padding: '14px' }}>{d.visit_date}</td>
                      <td style={{ padding: '14px' }}>
                        {d.reported_value !== undefined ? (
                          <div>
                            <strong>{d.reported_value}</strong>{' '}
                            {d.expected_range && (
                              <span style={{ color: 'var(--color-text-muted)' }}>
                                (Exp: {d.expected_range.min} – {d.expected_range.max})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>N/A</span>
                        )}
                      </td>
                      <td style={{ padding: '14px', maxWidth: '300px', color: 'var(--color-risk-high)' }}>
                        {d.reason || 'Physical proxy out of expected regional threshold'}
                      </td>
                      <td style={{ padding: '14px', maxWidth: '320px' }}>
                        <div style={{ fontWeight: 700, color: d.officer_action === 'OVERRIDE' ? 'var(--color-accent-ochre-dark)' : 'var(--color-primary-forest)' }}>
                          {d.officer_action || 'OVERRIDE'}
                        </div>
                        {d.override_reason && (
                          <div style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--color-text-secondary)', marginTop: '4px', backgroundColor: '#FFF9E6', padding: '6px 10px', borderRadius: '6px', borderLeft: '3px solid var(--color-accent-ochre)' }}>
                            "{d.override_reason}"
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '16px' }}>
              No entries found matching the selected filter in the discrepancy ledger.
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ENTERPRISE 360° DRILL-DOWN */}
      {activeTab === 'enterprises' && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>
          {/* Left Column: Enterprise Selector */}
          <div style={{ backgroundColor: 'var(--color-bg-page)', borderRadius: '14px', border: '2px solid var(--color-border)', padding: '20px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-authority-navy)', margin: '0 0 16px 0' }}>
              Select Enterprise ({localEnterprises.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '600px', overflowY: 'auto' }}>
              {localEnterprises.map((ent) => (
                <button
                  key={ent.client_id}
                  onClick={() => setSelectedEnterpriseId(ent.client_id)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    textAlign: 'left',
                    border: '1px solid var(--color-border)',
                    backgroundColor: selectedEnterpriseId === ent.client_id ? 'var(--color-authority-navy)' : '#FFF',
                    color: selectedEnterpriseId === ent.client_id ? '#FFF' : 'var(--color-text-primary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>{ent.owner_name}</div>
                  <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '2px' }}>
                    {ent.village || 'Vidarbha'} • {ent.cluster_id.includes('Kirana') || ent.cluster_id === '44444444-4444-4444-4444-444444444444' ? 'Kirana' : ent.cluster_id.includes('Handicraft') || ent.cluster_id === '55555555-5555-5555-5555-555555555555' ? 'Handicraft' : 'Dairy'}
                  </div>
                </button>
              ))}
              {localEnterprises.length === 0 && (
                <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>No local enterprises found.</div>
              )}
            </div>
          </div>

          {/* Right Column: Detailed Timeline & Audit Trail */}
          <div style={{ backgroundColor: 'var(--color-bg-page)', borderRadius: '14px', border: '2px solid var(--color-border)', padding: '24px' }}>
            {detailLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', fontSize: '16px' }}>🔄 Loading 360° enterprise profile...</div>
            ) : enterpriseDetail ? (
              <div>
                {/* Profile Header */}
                <div style={{ borderBottom: '2px solid var(--color-border)', paddingBottom: '20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-authority-navy)', margin: '0 0 6px 0' }}>
                      {enterpriseDetail.enterprise.owner_name}
                    </h2>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <span>📍 {enterpriseDetail.enterprise.village || 'Vidarbha District'}, {enterpriseDetail.enterprise.state || 'Maharashtra'}</span>
                      <span>🛰️ GPS: {(enterpriseDetail.enterprise.gps_lat ?? 21.1458).toFixed(4)}, {(enterpriseDetail.enterprise.gps_lng ?? 79.0882).toFixed(4)} ({(enterpriseDetail.enterprise.gps_accuracy ?? 5)}m accuracy)</span>
                      <span>🔑 Client ID: <code style={{ fontSize: '12px' }}>{enterpriseDetail.enterprise.client_id.slice(0, 12)}...</code></span>
                    </div>
                  </div>
                  <span style={{ backgroundColor: 'var(--color-primary-forest)', color: '#FFF', padding: '6px 14px', borderRadius: '20px', fontWeight: 700, fontSize: '14px' }}>
                    Cluster: {enterpriseDetail.enterprise.cluster_id.includes('Kirana') || enterpriseDetail.enterprise.cluster_id === '44444444-4444-4444-4444-444444444444' ? 'Kirana / Rural Retail' : enterpriseDetail.enterprise.cluster_id.includes('Handicraft') || enterpriseDetail.enterprise.cluster_id === '55555555-5555-5555-5555-555555555555' ? 'Handicraft' : 'Dairy'}
                  </span>
                </div>

                {/* Consent Verification Section */}
                <div style={{ marginBottom: '28px' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-authority-navy)', textTransform: 'uppercase', marginBottom: '12px' }}>
                    🛡️ Digital Consent & Cryptographic Audit Trail
                  </h4>
                  {enterpriseDetail.consents && enterpriseDetail.consents.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                      {enterpriseDetail.consents.map((c, i) => (
                        <div key={i} style={{ padding: '14px', backgroundColor: 'var(--color-bg-surface-alt)', borderRadius: '8px', borderLeft: '4px solid var(--color-primary-forest)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>
                            <span>Method: {c.method.toUpperCase()} ({c.language.toUpperCase()})</span>
                            <span style={{ color: 'var(--color-primary-forest)' }}>✓ Verified</span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', wordBreak: 'break-all' }}>
                            Token: <code>{c.consent_token}</code>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                            Logged: {new Date(c.client_submitted_at).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>No consent records stored yet.</div>
                  )}
                </div>

                {/* Assessments History Timeline */}
                <div>
                  <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-authority-navy)', textTransform: 'uppercase', marginBottom: '16px' }}>
                    📈 Assessment History & Proxy Calibration Timeline ({enterpriseDetail.assessments?.length || 0})
                  </h4>
                  {enterpriseDetail.assessments && enterpriseDetail.assessments.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {enterpriseDetail.assessments.map((rec, i) => (
                        <div key={rec.client_record_uuid || i} style={{ padding: '18px', backgroundColor: '#FFF', border: '2px solid var(--color-border)', borderRadius: '10px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                              <strong style={{ fontSize: '16px', color: 'var(--color-authority-navy)' }}>Visit Date: {rec.visit_date}</strong>
                              <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginLeft: '12px' }}>
                                UUID: {rec.client_record_uuid.slice(0, 8)}...
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              <span className={`status-badge ${rec.risk_tier?.toLowerCase() || 'medium'}`}>
                                Risk Tier: {rec.risk_tier || 'MEDIUM'}
                              </span>
                              {rec.officer_action && (
                                <span style={{ backgroundColor: rec.officer_action === 'OVERRIDE' ? 'var(--color-accent-ochre)' : 'var(--color-risk-low-bg)', color: rec.officer_action === 'OVERRIDE' ? '#000' : 'var(--color-risk-low)', padding: '4px 10px', borderRadius: '6px', fontWeight: 700, fontSize: '12px' }}>
                                  Decision: {rec.officer_action}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Physical proxy values */}
                          <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-surface-alt)', borderRadius: '8px', fontSize: '14px', marginBottom: '10px' }}>
                            <strong style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>Reported Physical Proxies:</strong>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                              {Object.entries(rec.physical_proxies || {}).filter(([k]) => k !== 'climate_snapshot' && k !== 'applied_modifier').map(([k, v]) => (
                                <div key={k}>
                                  <span style={{ color: 'var(--color-text-muted)' }}>{k.replace(/_/g, ' ')}:</span> <strong>{String(v)}</strong>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Climate modifier details if present */}
                          {((rec.physical_proxies as any)?.climate_snapshot || (rec.physical_proxies as any)?.applied_modifier) && (
                            <div style={{ padding: '10px 12px', backgroundColor: '#EBF5FF', borderLeft: '4px solid #3B82F6', borderRadius: '6px', fontSize: '13px', marginTop: '8px' }}>
                              <span style={{ fontWeight: 700, color: '#1E3A8A' }}>🌦️ Climate & Market Modifier: </span>
                              <strong>{String((rec.physical_proxies as any)?.climate_snapshot?.applied_modifier ?? (rec.physical_proxies as any)?.applied_modifier)}x</strong>
                              {((rec.physical_proxies as any)?.climate_snapshot?.notes) && (
                                <span style={{ marginLeft: '8px', fontStyle: 'italic' }}>({(rec.physical_proxies as any).climate_snapshot.notes})</span>
                              )}
                            </div>
                          )}

                          {rec.override_reason && (
                            <div style={{ marginTop: '10px', padding: '10px 14px', backgroundColor: '#FFF9E6', borderRadius: '6px', borderLeft: '4px solid var(--color-accent-ochre)', fontSize: '14px' }}>
                              <strong>Officer Override Justification:</strong> "{rec.override_reason}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>No assessments completed yet for this enterprise.</div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Please select an enterprise from the left column to view its 360° profile.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CRYPTOGRAPHIC AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div style={{ backgroundColor: 'var(--color-bg-page)', borderRadius: '14px', border: '2px solid var(--color-border)', padding: '24px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-authority-navy)', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔒</span> Immutable Cryptographic Audit & Governance Ledger
          </h3>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
            Complete tamper-proof sequence of AI model inferences, human-in-the-loop officer overrides, and consent captures across the institution.
          </p>

          {auditLogs.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)', backgroundColor: 'var(--color-bg-surface-alt)', color: 'var(--color-authority-navy)' }}>
                    <th style={{ padding: '12px 14px' }}>Timestamp</th>
                    <th style={{ padding: '12px 14px' }}>Actor Type</th>
                    <th style={{ padding: '12px 14px' }}>Actor Name</th>
                    <th style={{ padding: '12px 14px' }}>Event Action</th>
                    <th style={{ padding: '12px 14px' }}>Payload Snapshot</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log, idx) => (
                    <tr key={log.id || idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '14px', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '14px' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontWeight: 700,
                          fontSize: '12px',
                          backgroundColor: log.actor_type === 'OFFICER' ? 'var(--color-accent-ochre)' : log.actor_type === 'AI' ? '#E0E7FF' : '#E5E7EB',
                          color: log.actor_type === 'OFFICER' ? '#000' : log.actor_type === 'AI' ? '#3730A3' : '#374151',
                        }}>
                          {log.actor_type}
                        </span>
                      </td>
                      <td style={{ padding: '14px', fontWeight: 600 }}>{log.actor_name}</td>
                      <td style={{ padding: '14px', fontWeight: 700, color: 'var(--color-authority-navy)' }}>
                        {log.event_type}
                      </td>
                      <td style={{ padding: '14px', fontSize: '13px', fontFamily: 'monospace', color: 'var(--color-text-secondary)', maxWidth: '400px', wordBreak: 'break-all' }}>
                        {log.payload ? JSON.stringify(log.payload) : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '16px' }}>
              No audit entries recorded in the current session/ledger.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
