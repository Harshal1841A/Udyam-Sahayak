import React, { useState, useEffect } from 'react';
import { getOfficerInfo } from '../services/api';
import { saveProxyRecordLocal, getProxyRecordLocal, getEnterpriseLocal } from '../db/indexedDB';
import type {
  ProxyRecord,
  DairyPhysicalProxies,
  KiranaPhysicalProxies,
  HandicraftPhysicalProxies,
  DiscrepancyResult,
  Enterprise,
} from '../types';

interface ProxyFormProps {
  onNavigate: (view: string, params?: any) => void;
  enterpriseId: string;
  recordUuid?: string;
}

export const ProxyForm: React.FC<ProxyFormProps> = ({ onNavigate, enterpriseId, recordUuid }) => {
  const officer = getOfficerInfo();
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [clientRecordUuid, setClientRecordUuid] = useState<string>(recordUuid || '');
  const [saving, setSaving] = useState<boolean>(false);

  // Dairy state
  const [livestockCount, setLivestockCount] = useState<string>('4');
  const [milkVolume, setMilkVolume] = useState<string>('28');
  const [fodderExpense, setFodderExpense] = useState<string>('3500');
  const [electricityBill, setElectricityBill] = useState<string>('450');

  // Kirana state
  const [floorAreaSqft, setFloorAreaSqft] = useState<string>('150');
  const [skusCount, setSkusCount] = useState<string>('110');
  const [restockFreq, setRestockFreq] = useState<string>('4');
  const [kiranaElectricity, setKiranaElectricity] = useState<string>('600');

  // Handicraft state
  const [artisansCount, setArtisansCount] = useState<string>('3');
  const [loomsCount, setLoomsCount] = useState<string>('2');
  const [rawMaterialExpense, setRawMaterialExpense] = useState<string>('4500');
  const [daysSinceOrder, setDaysSinceOrder] = useState<string>('15');

  // Bounded Climate & Market Modifier (±10%)
  const [climateModifier, setClimateModifier] = useState<string>('1.00');
  const [climateNotes, setClimateNotes] = useState<string>('Normal seasonal conditions');

  const [discrepancy, setDiscrepancy] = useState<DiscrepancyResult | null>(null);

  // Initialize or load draft & enterprise
  useEffect(() => {
    const initOrLoad = async () => {
      const ent = await getEnterpriseLocal(enterpriseId);
      if (ent) {
        setEnterprise(ent);
      }

      if (recordUuid) {
        const existing = await getProxyRecordLocal(recordUuid);
        if (existing && existing.physical_proxies) {
          const p = existing.physical_proxies as any;
          if (p.livestock_count !== undefined) {
            setLivestockCount(String(p.livestock_count ?? 4));
            setMilkVolume(String(p.milk_volume_l_day ?? 28));
            setFodderExpense(String(p.fodder_expense_monthly ?? 3500));
            setElectricityBill(String(p.electricity_bill_monthly ?? 450));
          } else if (p.floor_area_sqft !== undefined) {
            setFloorAreaSqft(String(p.floor_area_sqft ?? 150));
            setSkusCount(String(p.skus_count ?? 110));
            setRestockFreq(String(p.restock_freq_monthly ?? 4));
            setKiranaElectricity(String(p.electricity_bill_monthly ?? 600));
          } else if (p.artisans_count !== undefined) {
            setArtisansCount(String(p.artisans_count ?? 3));
            setLoomsCount(String(p.looms_equipment_count ?? 2));
            setRawMaterialExpense(String(p.raw_material_expense_monthly ?? 4500));
            setDaysSinceOrder(String(p.days_since_last_order ?? 15));
          }
          if (p.climate_snapshot) {
            setClimateModifier(String(p.climate_snapshot.applied_modifier ?? 1.00));
            if (p.climate_snapshot.notes) setClimateNotes(p.climate_snapshot.notes);
          } else if (p.applied_modifier !== undefined) {
            setClimateModifier(String(p.applied_modifier));
          }
        }
      } else {
        // Create new UUID for this assessment session
        const newUuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
        setClientRecordUuid(newUuid);
      }
    };
    initOrLoad();
  }, [enterpriseId, recordUuid]);

  // Determine active cluster type
  const clusterType = (() => {
    if (!enterprise) return 'dairy';
    if (enterprise.cluster_id === '44444444-4444-4444-4444-444444444444' || enterprise.cluster_id.includes('Kirana')) {
      return 'kirana';
    }
    if (enterprise.cluster_id === '55555555-5555-5555-5555-555555555555' || enterprise.cluster_id.includes('Handicraft')) {
      return 'handicraft';
    }
    return 'dairy';
  })();

  // Real-time bounds and discrepancy checks based on cluster
  useEffect(() => {
    if (clusterType === 'dairy') {
      const cows = Number(livestockCount) || 0;
      const milk = Number(milkVolume) || 0;
      if (cows > 0 && milk > 0) {
        const milkPerCow = milk / cows;
        if (milkPerCow > 35) {
          setDiscrepancy({
            flagged: true,
            expected_range: [5, 30],
            reported_value: Number(milkPerCow.toFixed(1)),
            reason: `High Discrepancy: Reported daily milk average (${milkPerCow.toFixed(1)} L/cow) exceeds standard Indian dairy breed maximum (30 L/cow/day). Please verify livestock count or milk slips.`,
          });
        } else if (milkPerCow < 2 && cows <= 10) {
          setDiscrepancy({
            flagged: true,
            expected_range: [4, 25],
            reported_value: Number(milkPerCow.toFixed(1)),
            reason: `Low Discrepancy: Daily milk yield per cattle (${milkPerCow.toFixed(1)} L/cow) is unusually low. Verify if cattle are currently lactating or dry.`,
          });
        } else {
          setDiscrepancy({ flagged: false });
        }
      } else {
        setDiscrepancy(null);
      }
    } else if (clusterType === 'kirana') {
      const area = Number(floorAreaSqft) || 0;
      const skus = Number(skusCount) || 0;
      if (area > 0 && skus > 0) {
        const density = skus / area;
        if (density > 3.0) {
          setDiscrepancy({
            flagged: true,
            expected_range: [0.3, 2.5],
            reported_value: Number(density.toFixed(2)),
            reason: `High Discrepancy: Reported SKU density (${density.toFixed(1)} SKUs/sq.ft) is unusually high for rural retail. Please verify shelf counts or shop dimensions.`,
          });
        } else if (density < 0.15 && area > 100) {
          setDiscrepancy({
            flagged: true,
            expected_range: [0.3, 2.5],
            reported_value: Number(density.toFixed(2)),
            reason: `Low Discrepancy: SKU density (${density.toFixed(1)} SKUs/sq.ft) is extremely low. Verify if shelves are partially unstocked or shop is undergoing renovation.`,
          });
        } else {
          setDiscrepancy({ flagged: false });
        }
      } else {
        setDiscrepancy(null);
      }
    } else if (clusterType === 'handicraft') {
      const artisans = Number(artisansCount) || 0;
      const looms = Number(loomsCount) || 0;
      const days = Number(daysSinceOrder) || 0;
      if (artisans > 0 && looms > 0) {
        if (looms > artisans * 3) {
          setDiscrepancy({
            flagged: true,
            expected_range: [1, artisans * 2],
            reported_value: looms,
            reason: `High Discrepancy: Reported looms/equipment count (${looms}) significantly exceeds active artisans (${artisans}). Please verify operational status and idle machinery.`,
          });
        } else if (days > 60) {
          setDiscrepancy({
            flagged: true,
            expected_range: [1, 30],
            reported_value: days,
            reason: `High Discrepancy: Prolonged gap since last wholesale/retail order (${days} days). High risk of inventory stagnation or working capital freeze.`,
          });
        } else {
          setDiscrepancy({ flagged: false });
        }
      } else {
        setDiscrepancy(null);
      }
    }
  }, [clusterType, livestockCount, milkVolume, floorAreaSqft, skusCount, artisansCount, loomsCount, daysSinceOrder]);

  const handleSaveDraftAndProceed = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    let proxies: DairyPhysicalProxies | KiranaPhysicalProxies | HandicraftPhysicalProxies;
    let signal = 0;

    if (clusterType === 'dairy') {
      proxies = {
        livestock_count: Number(livestockCount) || 0,
        milk_volume_l_day: Number(milkVolume) || 0,
        fodder_expense_monthly: Number(fodderExpense) || 0,
        electricity_bill_monthly: Number(electricityBill) || 0,
      };
      signal = Number(milkVolume) * 35.0 * 30.0;
    } else if (clusterType === 'kirana') {
      proxies = {
        floor_area_sqft: Number(floorAreaSqft) || 0,
        skus_count: Number(skusCount) || 0,
        restock_freq_monthly: Number(restockFreq) || 0,
        electricity_bill_monthly: Number(kiranaElectricity) || 0,
      };
      signal = Number(skusCount) * 120.0 * Number(restockFreq);
    } else {
      proxies = {
        artisans_count: Number(artisansCount) || 0,
        looms_equipment_count: Number(loomsCount) || 0,
        raw_material_expense_monthly: Number(rawMaterialExpense) || 0,
        days_since_last_order: Number(daysSinceOrder) || 0,
      };
      signal = Number(artisansCount) * 15000.0;
    }

    const rawMod = parseFloat(climateModifier) || 1.0;
    const boundedMod = Math.min(1.10, Math.max(0.90, rawMod));
    const climateSnapshot = {
      applied_modifier: boundedMod,
      notes: climateNotes || 'Normal seasonal conditions',
      source: 'Field Officer Local Observation',
    };
    (proxies as any).climate_snapshot = climateSnapshot;
    (proxies as any).applied_modifier = boundedMod;

    const nowIso = new Date().toISOString();
    const record: ProxyRecord = {
      client_record_uuid: clientRecordUuid,
      enterprise_id: enterpriseId,
      officer_id: officer?.id || '22222222-2222-2222-2222-222222222222',
      visit_date: nowIso.slice(0, 10),
      client_submitted_at: nowIso,
      physical_proxies: proxies,
      bounds_validated: discrepancy !== null && !discrepancy.flagged,
      self_reported_signal: signal,
      discrepancy: discrepancy || { flagged: false },
      sync_status: 'draft',
    };

    await saveProxyRecordLocal(record);
    setSaving(false);
    onNavigate('forecast', { record_uuid: clientRecordUuid });
  };

  const clusterTitleName = (() => {
    if (clusterType === 'kirana') return 'Kirana / Rural Retail Physical Proxy Entry';
    if (clusterType === 'handicraft') return 'Handicraft Cluster Physical Proxy Entry';
    return 'Dairy Cluster Physical Proxy Entry';
  })();

  return (
    <div style={{ padding: '32px 24px', maxWidth: '800px', margin: '0 auto' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-authority-navy)' }}>
            {clusterTitleName}
          </h1>
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              padding: '6px 12px',
              backgroundColor: '#E2E8F0',
              borderRadius: '20px',
              color: 'var(--color-authority-navy)',
            }}
          >
            {enterprise?.owner_name ? `Owner: ${enterprise.owner_name}` : 'Gate 2 Evaluation'}
          </span>
        </div>
        <p style={{ fontSize: '16px', color: 'var(--color-text-secondary)', marginBottom: '24px', borderBottom: '2px solid var(--color-border)', paddingBottom: '16px' }}>
          Enter verified physical observations from field visit. Data is validated against cluster norms and saved immediately to IndexedDB.
        </p>

        {/* Live Discrepancy Alert Banner */}
        {discrepancy?.flagged && (
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: 'var(--color-risk-medium-bg)',
              border: '2px solid var(--color-risk-medium)',
              borderRadius: '10px',
              color: 'var(--color-risk-medium)',
              marginBottom: '24px',
              fontWeight: 600,
              fontSize: '16px',
            }}
          >
            ⚠ {discrepancy.reason}
          </div>
        )}

        <form onSubmit={handleSaveDraftAndProceed} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {clusterType === 'dairy' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                    Livestock Head Count (Cattle/Buffalo) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={livestockCount}
                    onChange={(e) => setLivestockCount(e.target.value)}
                    required
                    style={{ fontSize: '20px', padding: '12px 16px' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                    Expected range: 1 – 50 cattle
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                    Daily Milk Output (Liters / Day) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={milkVolume}
                    onChange={(e) => setMilkVolume(e.target.value)}
                    required
                    style={{ fontSize: '20px', padding: '12px 16px' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                    Verified via collection center slips or live milking
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                    Monthly Fodder & Feed Expense (₹) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={fodderExpense}
                    onChange={(e) => setFodderExpense(e.target.value)}
                    required
                    style={{ fontSize: '20px', padding: '12px 16px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                    Monthly Shed Electricity Bill (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={electricityBill}
                    onChange={(e) => setElectricityBill(e.target.value)}
                    style={{ fontSize: '20px', padding: '12px 16px' }}
                  />
                </div>
              </div>
            </>
          )}

          {clusterType === 'kirana' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                    Shop Floor Area (Sq.Ft.) *
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={5000}
                    value={floorAreaSqft}
                    onChange={(e) => setFloorAreaSqft(e.target.value)}
                    required
                    style={{ fontSize: '20px', padding: '12px 16px' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                    Measured shop selling + storage floor space
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                    Unique SKUs Count *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={skusCount}
                    onChange={(e) => setSkusCount(e.target.value)}
                    required
                    style={{ fontSize: '20px', padding: '12px 16px' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                    Estimated distinct item lines on shelves
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                    Restock Frequency (Times / Month) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={restockFreq}
                    onChange={(e) => setRestockFreq(e.target.value)}
                    required
                    style={{ fontSize: '20px', padding: '12px 16px' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                    Wholesaler / distributor deliveries per month
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                    Monthly Shop Electricity Bill (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={kiranaElectricity}
                    onChange={(e) => setKiranaElectricity(e.target.value)}
                    style={{ fontSize: '20px', padding: '12px 16px' }}
                  />
                </div>
              </div>
            </>
          )}

          {clusterType === 'handicraft' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                    Active Artisans / Workers Count *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={artisansCount}
                    onChange={(e) => setArtisansCount(e.target.value)}
                    required
                    style={{ fontSize: '20px', padding: '12px 16px' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                    Full-time or regular contract craftspeople
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                    Looms / Primary Equipment Count *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={loomsCount}
                    onChange={(e) => setLoomsCount(e.target.value)}
                    required
                    style={{ fontSize: '20px', padding: '12px 16px' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                    Operational looms, wheels, or work stations
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                    Monthly Raw Material Expense (₹) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={rawMaterialExpense}
                    onChange={(e) => setRawMaterialExpense(e.target.value)}
                    required
                    style={{ fontSize: '20px', padding: '12px 16px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                    Days Since Last Wholesale Order *
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={daysSinceOrder}
                    onChange={(e) => setDaysSinceOrder(e.target.value)}
                    required
                    style={{ fontSize: '20px', padding: '12px 16px' }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                    Days since last major batch purchase order
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Bounded Climate / Market Modifier Section */}
          <div style={{ padding: '20px', backgroundColor: 'var(--color-bg-surface-alt)', borderRadius: '12px', border: '2px solid var(--color-border)', marginTop: '8px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-authority-navy)', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🌦️</span> Bounded Climate & Market Modifier (±10%)
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '16px', lineHeight: '1.4' }}>
              Field Officer adjustments for local environmental or market shocks (e.g. drought, flood, sudden feed price surge). Strictly bounded between <strong>0.90 (-10%)</strong> and <strong>1.10 (+10%)</strong> to prevent arbitrary human scoring bias.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                  Modifier Multiplier (0.90 – 1.10) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0.90}
                  max={1.10}
                  value={climateModifier}
                  onChange={(e) => setClimateModifier(e.target.value)}
                  required
                  style={{ fontSize: '20px', padding: '12px 16px', width: '100%', fontWeight: 700, color: Number(climateModifier) < 1.0 ? 'var(--color-risk-high)' : Number(climateModifier) > 1.0 ? 'var(--color-primary-forest)' : 'var(--color-text-primary)' }}
                />
                <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                  1.00 = Baseline | 0.90 = Max Penalty | 1.10 = Max Boost
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px' }}>
                  Observation & Justification Notes *
                </label>
                <input
                  type="text"
                  value={climateNotes}
                  onChange={(e) => setClimateNotes(e.target.value)}
                  placeholder="e.g., Heavy monsoon damage to local access roads; minor feed delay"
                  required
                  style={{ fontSize: '16px', padding: '12px 16px', width: '100%' }}
                />
                <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                  Logged with cryptographically signed local assessment
                </span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={saving}
            style={{ marginTop: '16px', padding: '16px', fontSize: '18px' }}
          >
            {saving ? 'Saving Draft...' : 'Calculate On-Device Forecast \u2192'}
          </button>
        </form>
      </div>
    </div>
  );
};
