import React, { useState } from 'react';
import { getOfficerInfo } from '../services/api';
import { saveConsentLocal, enqueueForSync } from '../db/indexedDB';
import type { Consent } from '../types';

interface ConsentCaptureProps {
  onNavigate: (view: string, params?: any) => void;
  enterpriseId: string;
  ownerName: string;
}

export const ConsentCapture: React.FC<ConsentCaptureProps> = ({ onNavigate, enterpriseId, ownerName }) => {
  const officer = getOfficerInfo();
  const [language, setLanguage] = useState<'hi' | 'te' | 'ta' | 'en'>('hi');
  const [method, setMethod] = useState<'biometric' | 'recorded_voice'>('recorded_voice');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedToken, setRecordedToken] = useState<string>('');
  const [agreed, setAgreed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const disclosures: Record<string, string> = {
    hi: 'यह मूल्यांकन क्रेडिट इतिहास की आवश्यकता के बिना आपकी ऋण पात्रता का अनुमान लगाने के लिए भौतिक डेयरी विवरण और ऑन-डिवाइस वॉयस/वीडियो कैप्चर करता है। आपका डेटा किसी भी तीसरे पक्ष के साथ साझा नहीं किया जाता है और सुरक्षित रूप से एन्क्रिप्टेड है।',
    te: 'ఈ అంచనా క్రెడిట్ హిస్టరీ అవసరం లేకుండా మీ రుణ అర్హతను అంచనా వేయడానికి భౌతిక పాడి వివరాలను మరియు ఆన్-డివైస్ వాయిస్/వీడియోను సేకరిస్తుంది. మీ డేటా మూడవ పక్షాలతో భాగస్వామ్యం చేయబడదు మరియు సురక్షితంగా ఎన్‌క్రిప్ట్ చేయబడింది.',
    ta: 'இந்த மதிப்பீடு கடன் வரலாறு தேவையில்லாமல் உங்கள் கடன் தகுதியை மதிப்பிட பால் பண்ணை விவரங்கள் மற்றும் ஆன்-டிவைஸ் குரல்/வீடியோவை பதிவு செய்கிறது. உங்கள் தரவு மூன்றாம் தரப்பினருடன் பகிரப்படாது மற்றும் பாதுகாப்பாக குறியாக்கம் செய்யப்பட்டுள்ளது.',
    en: 'This assessment captures physical dairy proxy data and on-device video/voice to estimate creditworthiness without requiring prior credit history. Your data is not shared with third parties and remains securely encrypted.',
  };

  const handleStartRecording = () => {
    setIsRecording(true);
    // Simulate 2.5 second audio/video consent token capture
    setTimeout(() => {
      setIsRecording(false);
      setRecordedToken(`voice_consent_token_${Date.now()}_sha256_e8f9a2b`);
    }, 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordedToken || !agreed) return;

    setLoading(true);
    const clientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

    const nowIso = new Date().toISOString();
    const consent: Consent = {
      client_id: clientId,
      enterprise_id: enterpriseId,
      method: method,
      language: language,
      consent_token: recordedToken,
      officer_id: officer?.id || '22222222-2222-2222-2222-222222222222',
      client_submitted_at: nowIso,
    };

    await saveConsentLocal(consent);
    await enqueueForSync({
      entity_type: 'consent',
      idempotency_key: clientId,
      payload: consent,
      queued_at: nowIso,
      retry_count: 0,
    });

    setLoading(false);
    onNavigate('proxy_form', { enterprise_id: enterpriseId, owner_name: ownerName });
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: '760px', margin: '0 auto' }}>
      <div className="card">
        <h1 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--color-authority-navy)', marginBottom: '8px' }}>
          Consent Capture — {ownerName}
        </h1>
        <p style={{ fontSize: '16px', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
          Mandatory informed consent in vernacular language prior to physical proxy collection.
        </p>

        {/* Language Selection Bar */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {(['hi', 'te', 'ta', 'en'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLanguage(lang)}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '16px',
                backgroundColor: language === lang ? 'var(--color-primary-forest)' : 'var(--color-bg-surface)',
                color: language === lang ? '#FFF' : 'var(--color-text-primary)',
                border: '2px solid var(--color-primary-forest)',
              }}
            >
              {lang === 'hi' ? 'हिंदी (Hindi)' : lang === 'te' ? 'తెలుగు (Telugu)' : lang === 'ta' ? 'தமிழ் (Tamil)' : 'English'}
            </button>
          ))}
        </div>

        {/* Disclosure Box */}
        <div
          style={{
            padding: '20px',
            backgroundColor: 'var(--color-bg-surface-alt)',
            borderLeft: '6px solid var(--color-accent-ochre)',
            borderRadius: '8px',
            fontSize: '18px',
            lineHeight: '1.6',
            fontWeight: 500,
            color: 'var(--color-authority-navy)',
            marginBottom: '28px',
          }}
        >
          "{disclosures[language]}"
        </div>

        {/* Capture Method */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '12px', fontSize: '16px' }}>
            Capture Verification Method
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="radio"
                name="method"
                checked={method === 'recorded_voice'}
                onChange={() => setMethod('recorded_voice')}
                style={{ width: '22px', height: '22px' }}
              />
              Recorded Voice Affirmation
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="radio"
                name="method"
                checked={method === 'biometric'}
                onChange={() => setMethod('biometric')}
                style={{ width: '22px', height: '22px' }}
              />
              On-Device Biometric Capture
            </label>
          </div>
        </div>

        {/* Recording Action Box */}
        <div style={{ textAlign: 'center', padding: '24px', backgroundColor: 'var(--color-bg-page)', borderRadius: '12px', border: '2px dashed var(--color-border)', marginBottom: '24px' }}>
          {recordedToken ? (
            <div style={{ color: 'var(--color-risk-low)', fontWeight: 700, fontSize: '18px' }}>
              ✓ Consent Token Recorded Successfully ({recordedToken.slice(0, 24)}...)
            </div>
          ) : isRecording ? (
            <div style={{ color: 'var(--color-risk-medium)', fontWeight: 700, fontSize: '18px' }}>
              🔴 Recording Consent... Farmer should state: "मुझे सहमति है / I agree"
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartRecording}
              className="btn-accent"
              style={{ padding: '14px 28px', fontSize: '18px' }}
            >
              🎙 Start Voice / Video Consent Capture
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '16px', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ width: '24px', height: '24px' }}
              />
              I, the Field Officer, confirm that the farmer clearly understood the disclosure and affirmatively provided consent.
            </label>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={!recordedToken || !agreed || loading}
            style={{ width: '100%', padding: '16px', fontSize: '18px' }}
          >
            {loading ? 'Saving...' : 'Save Consent & Proceed to Dairy Proxy Form \u2192'}
          </button>
        </form>
      </div>
    </div>
  );
};
