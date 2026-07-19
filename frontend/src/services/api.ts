import { getCachedClusterModel, cacheClusterModel, getCachedAudioBundle, cacheAudioBundle } from '../db/indexedDB';
import type {
  ClusterModelCache,
  AudioBundle,
  AdminPortfolioSummary,
  AdminDiscrepancyItem,
  AdminEnterpriseDetail,
  AdminAuditLogItem,
} from '../types';


const API_BASE_URL = 'http://localhost:8000/api/v1';

export function getToken(): string | null {
  return localStorage.getItem('access_token');
}

export function setToken(token: string): void {
  localStorage.setItem('access_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('officer_info');
}

export function getOfficerInfo(): any | null {
  const info = localStorage.getItem('officer_info');
  return info ? JSON.parse(info) : null;
}

export function setOfficerInfo(info: any): void {
  localStorage.setItem('officer_info', JSON.stringify(info));
}

export async function loginOfficer(phone: string, pin: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone, pin }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error(err.detail || 'Authentication failed');
  }

  const data = await response.json();
  setToken(data.access_token);
  setOfficerInfo(data.officer);

  // Immediately try to fetch and cache all cluster model bundles for offline use
  try {
    await fetchAndCacheAllModels();
  } catch (e) {
    console.warn('Could not cache models during login (maybe offline):', e);
  }

  return data;
}

export async function fetchAndCacheClusterModel(clusterIdentifier: string): Promise<ClusterModelCache> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const encodedId = encodeURIComponent(clusterIdentifier);
  const response = await fetch(`${API_BASE_URL}/models/cluster/${encodedId}`, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch model bundle for cluster ${clusterIdentifier} from server`);
  }

  const bundle = await response.json();
  const cacheItem: ClusterModelCache = {
    cluster_id: bundle.cluster_id,
    forecast_model_js: bundle.forecast_model_js,
    risk_model_js: bundle.risk_model_js,
    baseline_json: bundle.baseline_json,
    templates_json: bundle.templates_json,
    cached_at: bundle.cached_at || new Date().toISOString(),
  };

  await cacheClusterModel(cacheItem);
  return cacheItem;
}

export async function fetchAndCacheAllModels(): Promise<ClusterModelCache[]> {
  const clusters = [
    '33333333-3333-3333-3333-333333333333', // Dairy
    '44444444-4444-4444-4444-444444444444', // Kirana / Rural Retail
    '55555555-5555-5555-5555-555555555555', // Handicraft
  ];
  const languages = ['hi', 'te', 'ta', 'en'];
  const results: ClusterModelCache[] = [];
  for (const cid of clusters) {
    try {
      const cached = await fetchAndCacheClusterModel(cid);
      results.push(cached);
      for (const lang of languages) {
        try {
          await fetchClusterAudio(cid, lang);
        } catch (audioErr) {
          console.warn(`Failed to pre-cache audio ${cid}/${lang}:`, audioErr);
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch and cache cluster model ${cid}:`, err);
    }
  }
  return results;
}

export async function fetchAndCacheDairyModel(): Promise<ClusterModelCache> {
  return await fetchAndCacheClusterModel('33333333-3333-3333-3333-333333333333');
}

export async function getActiveClusterModel(clusterIdOrName: string = 'Dairy'): Promise<ClusterModelCache> {
  // First check local IndexedDB cache
  let cached = await getCachedClusterModel(clusterIdOrName);
  if (!cached) {
    // Also try mapping ID <-> Name
    const idToNameMap: Record<string, string> = {
      '33333333-3333-3333-3333-333333333333': 'Dairy',
      'Dairy': '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444': 'Kirana / Rural Retail',
      'Kirana / Rural Retail': '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555555': 'Handicraft',
      'Handicraft': '55555555-5555-5555-5555-555555555555',
    };
    const mapped = idToNameMap[clusterIdOrName];
    if (mapped) {
      cached = await getCachedClusterModel(mapped);
    }
  }
  if (cached) {
    return cached;
  }

  // If online, fetch from server
  if (navigator.onLine) {
    try {
      return await fetchAndCacheClusterModel(clusterIdOrName);
    } catch (e) {
      console.warn(`Server fetch failed for model ${clusterIdOrName}, checking fallbacks:`, e);
    }
  }

  // Fallback default sanitized m2cgen models if completely offline on first ever boot
  if (clusterIdOrName === '44444444-4444-4444-4444-444444444444' || clusterIdOrName.includes('Kirana')) {
    const item: ClusterModelCache = {
      cluster_id: '44444444-4444-4444-4444-444444444444',
      forecast_model_js: `function score(input) {
        var floor_area = (input.floor_area_sqft === null || input.floor_area_sqft === "") ? undefined : Number(input.floor_area_sqft);
        var skus = (input.skus_count === null || input.skus_count === "") ? undefined : Number(input.skus_count);
        var restock = (input.restock_freq_monthly === null || input.restock_freq_monthly === "") ? undefined : Number(input.restock_freq_monthly);
        var electricity = (input.electricity_bill_monthly === null || input.electricity_bill_monthly === "") ? undefined : Number(input.electricity_bill_monthly);
        var var0 = 350.0;
        if (floor_area !== undefined) {
            if (floor_area <= 120.0) { var0 += (skus !== undefined && skus > 80.0) ? 140.0 : 60.0; }
            else { var0 += (skus !== undefined && skus > 150.0) ? 380.0 : 210.0; }
        } else { var0 += (skus !== undefined) ? (skus * 2.0) : 75.0; }
        if (restock !== undefined) { var0 += restock * 15.0; }
        if (electricity !== undefined) { var0 -= (electricity * 0.15); }
        return Math.max(0, var0);
      }`,
      risk_model_js: `function risk_score(input) {
        var cashFlow = score(input);
        if (cashFlow > 500.0) return 0;
        if (cashFlow > 280.0) return 1;
        return 2;
      }`,
      baseline_json: { base_score: 350.0, floor_area_sqft_mean: 150.0, skus_count_mean: 110.0, restock_freq_monthly_mean: 4.0 },
      templates_json: {
        LOW: 'Strong rural retail turnover supported by healthy floor area velocity and frequent monthly restocks.',
        MEDIUM: 'Moderate inventory turnover detected; check SKU breadth against local village footfall and seasonal patterns.',
        HIGH: 'High risk of cash flow stagnation due to limited stock variety or infrequent replenishment cycles.',
      },
      cached_at: new Date().toISOString(),
    };
    await cacheClusterModel(item);
    return item;
  }

  if (clusterIdOrName === '55555555-5555-5555-5555-555555555555' || clusterIdOrName.includes('Handicraft')) {
    const item: ClusterModelCache = {
      cluster_id: '55555555-5555-5555-5555-555555555555',
      forecast_model_js: `function score(input) {
        var artisans = (input.artisans_count === null || input.artisans_count === "") ? undefined : Number(input.artisans_count);
        var looms = (input.looms_equipment_count === null || input.looms_equipment_count === "") ? undefined : Number(input.looms_equipment_count);
        var raw_material = (input.raw_material_expense_monthly === null || input.raw_material_expense_monthly === "") ? undefined : Number(input.raw_material_expense_monthly);
        var days_order = (input.days_since_last_order === null || input.days_since_last_order === "") ? undefined : Number(input.days_since_last_order);
        var var0 = 280.0;
        if (artisans !== undefined) {
            if (artisans <= 2.5) { var0 += (looms !== undefined && looms > 1.5) ? 110.0 : 50.0; }
            else { var0 += (looms !== undefined && looms > 3.5) ? 360.0 : 220.0; }
        } else { var0 += (looms !== undefined) ? (looms * 40.0) : 60.0; }
        if (raw_material !== undefined) { var0 += (raw_material * 0.05); }
        if (days_order !== undefined && days_order > 30) { var0 -= ((days_order - 30) * 2.5); }
        return Math.max(0, var0);
      }`,
      risk_model_js: `function risk_score(input) {
        var cashFlow = score(input);
        if (cashFlow > 420.0) return 0;
        if (cashFlow > 220.0) return 1;
        return 2;
      }`,
      baseline_json: { base_score: 280.0, artisans_count_mean: 3.0, looms_equipment_count_mean: 2.0, raw_material_expense_monthly_mean: 4500.0 },
      templates_json: {
        LOW: 'Consistent artisan production capacity with active loom utilization and steady order frequency.',
        MEDIUM: 'Irregular order pipeline detected; verify raw material availability and buyer order history.',
        HIGH: 'High cash flow vulnerability driven by prolonged gap since last wholesale order or underutilized looms.',
      },
      cached_at: new Date().toISOString(),
    };
    await cacheClusterModel(item);
    return item;
  }

  // Default fallback to Dairy
  const item: ClusterModelCache = {
    cluster_id: '33333333-3333-3333-3333-333333333333',
    forecast_model_js: `function score(input) {
      var livestock = (input.livestock_count === null || input.livestock_count === "") ? undefined : Number(input.livestock_count);
      var milk = (input.milk_volume_l_day === null || input.milk_volume_l_day === "") ? undefined : Number(input.milk_volume_l_day);
      var fodder = (input.fodder_expense_monthly === null || input.fodder_expense_monthly === "") ? undefined : Number(input.fodder_expense_monthly);
      var var0 = 220.0;
      if (livestock !== undefined) {
          if (livestock <= 3.5) { var0 += (milk !== undefined && milk > 15.0) ? 120.0 : 45.0; }
          else { var0 += (milk !== undefined && milk > 35.0) ? 450.0 : 280.0; }
      } else { var0 += (milk !== undefined) ? (milk * 8.0) : 50.0; }
      if (fodder !== undefined) { var0 -= (fodder * 0.1); }
      return Math.max(0, var0);
    }`,
    risk_model_js: `function risk_score(input) {
      var cashFlow = score(input);
      if (cashFlow > 400.0) return 0;
      if (cashFlow > 200.0) return 1;
      return 2;
    }`,
    baseline_json: { base_score: 220.0, livestock_mean: 4, milk_mean: 25.0, fodder_mean: 3000.0 },
    templates_json: {
      LOW: 'Stable cash flow supported by consistent daily milk volume and healthy livestock scale.',
      MEDIUM: 'Moderate seasonal variance detected; verify local fodder costs and veterinary records.',
      HIGH: 'High risk of cash flow deficit due to low herd output or elevated operational overhead.',
    },
    cached_at: new Date().toISOString(),
  };
  await cacheClusterModel(item);
  return item;
}

export async function getActiveDairyModel(): Promise<ClusterModelCache> {
  return await getActiveClusterModel('Dairy');
}

export async function fetchClusterAudio(clusterIdOrName: string, lang: string = 'hi'): Promise<AudioBundle> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/models/active/${clusterIdOrName}/audio/${lang}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch audio bundle for ${clusterIdOrName}/${lang}`);
  }

  const data: AudioBundle = await response.json();
  await cacheAudioBundle(`audio_${clusterIdOrName}_${lang}`, data);

  const idToNameMap: Record<string, string> = {
    '33333333-3333-3333-3333-333333333333': 'Dairy',
    'Dairy': '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444': 'Kirana / Rural Retail',
    'Kirana / Rural Retail': '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555': 'Handicraft',
    'Handicraft': '55555555-5555-5555-5555-555555555555',
  };
  const mapped = idToNameMap[clusterIdOrName];
  if (mapped) {
    await cacheAudioBundle(`audio_${mapped}_${lang}`, data);
  }

  return data;
}

export async function getClusterAudio(clusterIdOrName: string = 'Dairy', lang: string = 'hi'): Promise<AudioBundle> {
  let cached = await getCachedAudioBundle(`audio_${clusterIdOrName}_${lang}`);
  if (!cached) {
    const idToNameMap: Record<string, string> = {
      '33333333-3333-3333-3333-333333333333': 'Dairy',
      'Dairy': '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444': 'Kirana / Rural Retail',
      'Kirana / Rural Retail': '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555555': 'Handicraft',
      'Handicraft': '55555555-5555-5555-5555-555555555555',
    };
    const mapped = idToNameMap[clusterIdOrName];
    if (mapped) {
      cached = await getCachedAudioBundle(`audio_${mapped}_${lang}`);
    }
  }
  if (cached) {
    return cached;
  }

  if (navigator.onLine) {
    try {
      return await fetchClusterAudio(clusterIdOrName, lang as any);
    } catch (e) {
      console.warn(`Server fetch failed for audio bundle ${clusterIdOrName}/${lang}, falling back:`, e);
    }
  }

  const defaultTemplates: Record<string, Record<string, string>> = {
    hi: {
      Dairy: 'दूध उत्पादन और पशुधन स्वास्थ्य के आधार पर आपका नकद प्रवाह {CASHFLOW} रुपये अनुमानित है, जो {RISK} जोखिम श्रेणी में आता है।',
      Kirana: 'दैनिक बिक्री और इन्वेंट्री टर्नओवर के आधार पर आपका नकद प्रवाह {CASHFLOW} रुपये अनुमानित है, जो {RISK} जोखिम श्रेणी में आता है।',
      Handicraft: 'कच्चे माल और मासिक उत्पादन के आधार पर आपका नकद प्रवाह {CASHFLOW} रुपये अनुमानित है, जो {RISK} जोखिम श्रेणी में आता है।',
    },
    te: {
      Dairy: 'పాల ఉత్పత్తి మరియు పశువుల ఆరోగ్యం ఆధారంగా మీ నగదు ప్రవాహం {CASHFLOW} రూ. గా అంచనా వేయబడింది, ఇది {RISK} ప్రమాద వర్గంలో ఉంది.',
      Kirana: 'రోజువారీ అమ్మకాలు మరియు ఇన్వెంటరీ ఆధారంగా మీ నగదు ప్రవాహం {CASHFLOW} రూ. గా అంచనా వేయబడింది.',
      Handicraft: 'ముడి సరుకు మరియు నెలవారీ ఉత్పత్తి ఆధారంగా మీ నగదు ప్రవాహం {CASHFLOW} రూ. గా అంచనా వేయబడింది.',
    },
    ta: {
      Dairy: 'பால் உற்பத்தி மற்றும் கால்நடை ஆரோக்கியத்தின் அடிப்படையில் உங்கள் பணப்புழக்கம் ரூ. {CASHFLOW} என மதிப்பிடப்பட்டுள்ளது, இது {RISK} ஆபத்து பிரிவில் உள்ளது.',
      Kirana: 'தினசரி விற்பனை மற்றும் இருப்பு அடிப்படையில் உங்கள் பணப்புழக்கம் ரூ. {CASHFLOW} என மதிப்பிடப்பட்டுள்ளது.',
      Handicraft: 'மூலப்பொருட்கள் மற்றும் மாதாந்திர உற்பத்தி அடிப்படையில் உங்கள் பணப்புழக்கம் ரூ. {CASHFLOW} என மதிப்பிடப்பட்டுள்ளது.',
    },
    en: {
      Dairy: 'Based on milk volume and livestock scale, your estimated cash flow is INR {CASHFLOW}, placing you in the {RISK} risk tier.',
      Kirana: 'Based on daily revenue and inventory turnover, your estimated cash flow is INR {CASHFLOW}, placing you in the {RISK} risk tier.',
      Handicraft: 'Based on raw material expense and monthly production, your estimated cash flow is INR {CASHFLOW}, placing you in the {RISK} risk tier.',
    },
  };

  const clusterKey = clusterIdOrName.includes('Kirana') ? 'Kirana' : clusterIdOrName.includes('Handicraft') ? 'Handicraft' : 'Dairy';
  const tmpl = (defaultTemplates[lang] && defaultTemplates[lang][clusterKey]) || defaultTemplates.en[clusterKey];

  const item: AudioBundle = {
    cluster_id: clusterIdOrName,
    language: lang as any,
    explanation_template: tmpl,
    audio_data_uri: 'data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA=',
  };
  await cacheAudioBundle(`audio_${clusterIdOrName}_${lang}`, item);
  return item;
}

export async function getAdminPortfolio(): Promise<AdminPortfolioSummary> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/admin/portfolio`, { headers });
  if (!response.ok) throw new Error('Failed to fetch admin portfolio summary');
  return response.json();
}

export async function getAdminDiscrepancies(): Promise<AdminDiscrepancyItem[]> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/admin/discrepancies`, { headers });
  if (!response.ok) throw new Error('Failed to fetch admin discrepancies');
  return response.json();
}

export async function getAdminEnterpriseDetail(enterpriseId: string): Promise<AdminEnterpriseDetail> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/admin/enterprises/${enterpriseId}`, { headers });
  if (!response.ok) throw new Error(`Failed to fetch enterprise detail for ${enterpriseId}`);
  return response.json();
}

export async function getAdminAuditLogs(limit: number = 100): Promise<AdminAuditLogItem[]> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/admin/audit-logs?limit=${limit}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch admin audit logs');
  return response.json();
}

