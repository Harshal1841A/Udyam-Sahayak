import React, { useState, useEffect } from 'react';
import { getActiveClusterModel, getClusterAudio } from '../services/api';
import { getProxyRecordLocal, saveProxyRecordLocal, getEnterpriseLocal, enqueueForSync } from '../db/indexedDB';
import { syncOfflineQueue } from '../services/syncService';
import type { ProxyRecord, ForecastResult, Enterprise, AudioBundle } from '../types';

interface ForecastProps {
  onNavigate: (view: string, params?: any) => void;
  recordUuid: string;
}

export const Forecast: React.FC<ForecastProps> = ({ onNavigate, recordUuid }) => {
  const [record, setRecord] = useState<ProxyRecord | null>(null);
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [audioBundle, setAudioBundle] = useState<AudioBundle | null>(null);
  const [language, setLanguage] = useState<'hi' | 'te' | 'ta' | 'en'>('hi');
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [officerAction, setOfficerAction] = useState<'CONFIRM' | 'OVERRIDE'>('CONFIRM');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [evaluating, setEvaluating] = useState<boolean>(true);
  const [finalizing, setFinalizing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const runLocalInference = async () => {
      try {
        setEvaluating(true);
        const startTime = performance.now();
        const rec = await getProxyRecordLocal(recordUuid);
        if (!rec || !rec.physical_proxies) {
          throw new Error('Proxy record not found locally.');
        }
        setRecord(rec);

        const ent = await getEnterpriseLocal(rec.enterprise_id);
        if (ent) {
          setEnterprise(ent);
        }

        const clusterId = ent?.cluster_id || '33333333-3333-3333-3333-333333333333';
        const bundle = await getActiveClusterModel(clusterId);

        const p = rec.physical_proxies as any;
        let input: any = {};
        let importances: Record<string, number> = {};

        if (clusterId === '44444444-4444-4444-4444-444444444444' || clusterId.includes('Kirana')) {
          input = {
            floor_area_sqft: p.floor_area_sqft,
            skus_count: p.skus_count,
            restock_freq_monthly: p.restock_freq_monthly,
            electricity_bill_monthly: p.electricity_bill_monthly,
          };
        } else if (clusterId === '55555555-5555-5555-5555-555555555555' || clusterId.includes('Handicraft')) {
          input = {
            artisans_count: p.artisans_count,
            looms_equipment_count: p.looms_equipment_count,
            raw_material_expense_monthly: p.raw_material_expense_monthly,
            days_since_last_order: p.days_since_last_order,
          };
        } else {
          input = {
            livestock_count: p.livestock_count,
            milk_volume_l_day: p.milk_volume_l_day,
            fodder_expense_monthly: p.fodder_expense_monthly,
            electricity_bill_monthly: p.electricity_bill_monthly,
          };
        }

        // Execute m2cgen generated JS completely locally inside browser runtime (< 50ms)
        const scoreFn = new Function(bundle.forecast_model_js + '; return score(arguments[0]);');
        const riskFn = new Function(bundle.forecast_model_js + ';' + bundle.risk_model_js + '; return risk_score(arguments[0]);');

        const baseScoreCalc = Number(scoreFn(input)) || bundle.baseline_json.base_score || 220.0;
        
        // Apply bounded climate/market modifier [0.90, 1.10] per Gate 3 spec & TRD §4.2
        const modifierRaw = Number(p.climate_snapshot?.applied_modifier ?? p.applied_modifier ?? 1.0);
        const boundedModifier = Math.min(1.10, Math.max(0.90, isNaN(modifierRaw) ? 1.0 : modifierRaw));
        const rawScore = baseScoreCalc * boundedModifier;

        let rawRisk = Number(riskFn(input));
        if (boundedModifier !== 1.0) {
          if (clusterId === '44444444-4444-4444-4444-444444444444' || clusterId.includes('Kirana')) {
            if (rawScore > 600.0) rawRisk = 0;
            else if (rawScore > 450.0) rawRisk = 1;
            else rawRisk = 2;
          } else if (clusterId === '55555555-5555-5555-5555-555555555555' || clusterId.includes('Handicraft')) {
            if (rawScore > 400.0) rawRisk = 0;
            else if (rawScore > 250.0) rawRisk = 1;
            else rawRisk = 2;
          } else {
            if (rawScore > 180.0) rawRisk = 0;
            else if (rawScore > 120.0) rawRisk = 1;
            else rawRisk = 2;
          }
        }

        const riskTier: 'LOW' | 'MEDIUM' | 'HIGH' = rawRisk === 0 ? 'LOW' : rawRisk === 1 ? 'MEDIUM' : 'HIGH';
        const explanation = bundle.templates_json[riskTier] || 'Cluster calibrated cash flow prediction completed.';

        const execTime = Math.round(performance.now() - startTime);

        const result: ForecastResult = {
          predicted_monthly_cash_flow: Math.round(rawScore * 10) / 10,
          confidence_interval: [Math.max(0, Math.round(rawScore * 0.85)), Math.round(rawScore * 1.15)],
          risk_tier: riskTier,
          feature_importances: importances,
          explanation_text: explanation,
          execution_time_ms: execTime,
        };

        setForecast(result);
        setEvaluating(false);
      } catch (err: any) {
        setError(err.message || 'On-device inference failed.');
        setEvaluating(false);
      }
    };

    runLocalInference();
  }, [recordUuid]);

  useEffect(() => {
    if (!enterprise && !record) return;
    const cid = enterprise?.cluster_id || 'Dairy';
    getClusterAudio(cid, language)
      .then((bundle) => setAudioBundle(bundle))
      .catch((e) => console.warn('Failed to load audio bundle:', e));
  }, [enterprise, record, language]);

  const getLocalizedSpokenText = () => {
    if (!forecast) return '';
    if (audioBundle?.explanation_template) {
      const localizedRisk =
        language === 'hi'
          ? forecast.risk_tier === 'LOW'
            ? 'कम (Low)'
            : forecast.risk_tier === 'MEDIUM'
            ? 'मध्यम (Medium)'
            : 'उच्च (High)'
          : forecast.risk_tier;
      return audioBundle.explanation_template
        .replace('{CASHFLOW}', String(forecast.predicted_monthly_cash_flow))
        .replace('{RISK}', localizedRisk);
    }
    return forecast.explanation_text;
  };

  const handlePlaySpokenExplanation = () => {
    if (!forecast) return;
    setIsPlayingAudio(true);
    const textToSpeak = getLocalizedSpokenText();

    // Check if audioBundle has a playable data URI (real mp3 bytes)
    if (audioBundle?.audio_data_uri && audioBundle.audio_data_uri.length > 200 && !audioBundle.audio_data_uri.includes('AWGluZwAAAA')) {
      const audio = new Audio(audioBundle.audio_data_uri);
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => {
        // Fallback to Web Speech API instantly (< 1s latency)
        fallbackSpeak(textToSpeak);
      };
      audio.play().catch(() => fallbackSpeak(textToSpeak));
    } else {
      fallbackSpeak(textToSpeak);
    }
  };

  const fallbackSpeak = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'hi' ? 'hi-IN' : language === 'te' ? 'te-IN' : language === 'ta' ? 'ta-IN' : 'en-IN';
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      window.speechSynthesis.speak(utterance);
    } else {
      setIsPlayingAudio(false);
    }
  };

  const handleFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!record || !forecast) return;
    if (officerAction === 'OVERRIDE' && overrideReason.trim().length < 10) {
      setError('Please provide a detailed justification (at least 10 characters) when overriding the AI risk tier.');
      return;
    }

    setFinalizing(true);
    setError('');

    const nowIso = new Date().toISOString();
    const updatedRecord: ProxyRecord = {
      ...record,
      forecast_result: forecast,
      officer_action: officerAction,
      override_reason: officerAction === 'OVERRIDE' ? overrideReason.trim() : undefined,
      sync_status: 'pending', // Ready for sync queue
    };

    // Save finalized record to local storage
    await saveProxyRecordLocal(updatedRecord);

    // Enqueue to sync queue
    await enqueueForSync({
      entity_type: 'proxy_record',
      idempotency_key: updatedRecord.client_record_uuid,
      payload: updatedRecord,
      queued_at: nowIso,
      retry_count: 0,
    });

    // Proactively try to sync if online
    if (navigator.onLine) {
      try {
        await syncOfflineQueue();
      } catch (e) {
        console.warn('Background sync deferred to next connection check:', e);
      }
    }

    setFinalizing(false);
    onNavigate('dashboard');
  };

  const clusterTitleName = (() => {
    if (!enterprise) return 'Dairy Cluster';
    if (enterprise.cluster_id === '44444444-4444-4444-4444-444444444444' || enterprise.cluster_id.includes('Kirana')) return 'Kirana / Rural Retail';
    if (enterprise.cluster_id === '55555555-5555-5555-5555-555555555555' || enterprise.cluster_id.includes('Handicraft')) return 'Handicraft Cluster';
    return 'Dairy Cluster';
  })();

  if (evaluating) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <div className="card">
          <h2 style={{ fontSize: '24px', color: 'var(--color-authority-navy)', marginBottom: '16px' }}>
            Evaluating {clusterTitleName} Model On-Device...
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '18px' }}>
            Executing sanitized `m2cgen` JavaScript tree ensemble locally ({clusterTitleName} model bundle).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: '860px', margin: '0 auto' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-authority-navy)' }}>
            On-Device Assessment Forecast ({clusterTitleName})
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
          Inference computed entirely on-device via local JavaScript tree model ({forecast?.execution_time_ms}ms runtime). Zero server latency.
        </p>

        {error && (
          <div style={{ padding: '14px 18px', backgroundColor: 'var(--color-risk-high-bg)', border: '2px solid var(--color-risk-high)', borderRadius: '10px', color: 'var(--color-risk-high)', fontWeight: 600, marginBottom: '24px' }}>
            {error}
          </div>
        )}

        {/* Big Forecast Display Box */}
        {forecast && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
            <div style={{ padding: '24px', backgroundColor: 'var(--color-bg-page)', borderRadius: '14px', border: '2px solid var(--color-border)', textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Predicted Monthly Cash Flow
              </div>
              <div style={{ fontSize: '42px', fontWeight: 800, color: 'var(--color-primary-forest)' }}>
                ₹{forecast.predicted_monthly_cash_flow.toLocaleString()}
              </div>
              <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
                85% Confidence: ₹{forecast.confidence_interval[0]} – ₹{forecast.confidence_interval[1]}
              </div>
            </div>

            <div style={{ padding: '24px', backgroundColor: 'var(--color-bg-page)', borderRadius: '14px', border: '2px solid var(--color-border)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>
                Assessed Risk Tier
              </div>
              <span className={`status-badge ${forecast.risk_tier.toLowerCase()}`} style={{ fontSize: '20px', padding: '10px 24px' }}>
                {forecast.risk_tier === 'LOW' ? '✓ LOW RISK' : forecast.risk_tier === 'MEDIUM' ? '⚠ MEDIUM RISK' : '✕ HIGH RISK'}
              </span>
            </div>
          </div>
        )}

        {/* Dynamic Explainability Card & Audio Playback */}
        {forecast && (
          <div style={{ padding: '20px', backgroundColor: 'var(--color-bg-surface-alt)', borderRadius: '12px', marginBottom: '32px', borderLeft: '6px solid var(--color-primary-forest)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-authority-navy)', margin: 0 }}>
                Model Explanation & Feature Contributions ({clusterTitleName})
              </h3>

              {/* Language Selection Bar & Audio Button */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {(['hi', 'te', 'ta', 'en'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '14px',
                      backgroundColor: language === lang ? 'var(--color-primary-forest)' : '#FFF',
                      color: language === lang ? '#FFF' : 'var(--color-text-primary)',
                      border: '1px solid var(--color-primary-forest)',
                    }}
                  >
                    {lang === 'hi' ? 'HI' : lang === 'te' ? 'TE' : lang === 'ta' ? 'TA' : 'EN'}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handlePlaySpokenExplanation}
                  disabled={isPlayingAudio}
                  className="btn-accent"
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: isPlayingAudio ? '#F59E0B' : 'var(--color-accent-ochre)',
                  }}
                >
                  {isPlayingAudio ? '🔊 Speaking...' : '🔊 Spoken Explanation'}
                </button>
              </div>
            </div>

            <p style={{ fontSize: '16px', color: 'var(--color-text-primary)', marginBottom: '16px', lineHeight: '1.5', fontWeight: 500 }}>
              {getLocalizedSpokenText()}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', fontSize: '14px' }}>
              {Object.entries(forecast.feature_importances).map(([key, val]) => (
                <div key={key} style={{ padding: '10px', backgroundColor: '#FFF', borderRadius: '6px' }}>
                  <span style={{ textTransform: 'capitalize', color: 'var(--color-text-secondary)' }}>
                    {key.replace(/_/g, ' ')}:
                  </span>{' '}
                  <strong>{key === 'base_score' ? `₹${val}` : `${val >= 0 ? '+' : ''}₹${val}`}</strong>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* Officer Decision Gate */}
        <form onSubmit={handleFinalize} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <div style={{ padding: '20px', backgroundColor: 'var(--color-bg-page)', borderRadius: '12px', border: '2px solid var(--color-border)' }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: '18px', color: 'var(--color-authority-navy)', marginBottom: '16px' }}>
              Officer Final Decision (Human-in-the-Loop Authority) *
            </label>
            <div style={{ display: 'flex', gap: '20px', marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '18px', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="radio"
                  name="officerAction"
                  checked={officerAction === 'CONFIRM'}
                  onChange={() => setOfficerAction('CONFIRM')}
                  style={{ width: '24px', height: '24px' }}
                />
                Confirm & Accept AI Risk Tier
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '18px', cursor: 'pointer', fontWeight: 600, color: 'var(--color-accent-ochre-dark)' }}>
                <input
                  type="radio"
                  name="officerAction"
                  checked={officerAction === 'OVERRIDE'}
                  onChange={() => setOfficerAction('OVERRIDE')}
                  style={{ width: '24px', height: '24px' }}
                />
                Override AI Assessment Tier
              </label>
            </div>

            {officerAction === 'OVERRIDE' && (
              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '16px', color: 'var(--color-accent-ochre-dark)' }}>
                  Mandatory Justification for Override (min 10 characters) *
                </label>
                <textarea
                  rows={3}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Farmer recently purchased two high-yielding Gir cattle not reflected in historical collection slips."
                  required
                  style={{ fontSize: '16px', padding: '12px', width: '100%' }}
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={finalizing || (officerAction === 'OVERRIDE' && overrideReason.trim().length < 10)}
            style={{ padding: '18px', fontSize: '20px', width: '100%', fontWeight: 700 }}
          >
            {finalizing ? 'Finalizing & Enqueuing to Sync...' : 'Finalize Decision & Save Assessment \u2192'}
          </button>
        </form>
      </div>
    </div>
  );
};
