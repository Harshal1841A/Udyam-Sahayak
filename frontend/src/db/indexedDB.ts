import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type {
  Enterprise,
  Consent,
  ProxyRecord,
  ClusterModelCache,
  SyncQueueItem,
  AudioBundle,
} from '../types';

interface KisanCreditDBSchema extends DBSchema {
  local_enterprises: {
    key: string; // client_id
    value: Enterprise;
    indexes: { 'by-sync': string };
  };
  local_consents: {
    key: string; // client_id
    value: Consent;
    indexes: { 'by-enterprise': string };
  };
  local_proxy_records: {
    key: string; // client_record_uuid
    value: ProxyRecord;
    indexes: { 'by-enterprise': string; 'by-status': string };
  };
  cluster_model_cache: {
    key: string; // cluster_id or audio key
    value: any;
  };

  sync_queue: {
    key: number; // auto-increment
    value: SyncQueueItem;
    indexes: { 'by-type': string; 'by-key': string };
  };
}

const DB_NAME = 'kisan_credit_copilot_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<KisanCreditDBSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<KisanCreditDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<KisanCreditDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // local_enterprises store
        if (!db.objectStoreNames.contains('local_enterprises')) {
          const store = db.createObjectStore('local_enterprises', { keyPath: 'client_id' });
          store.createIndex('by-sync', 'client_id');
        }
        // local_consents store
        if (!db.objectStoreNames.contains('local_consents')) {
          const store = db.createObjectStore('local_consents', { keyPath: 'client_id' });
          store.createIndex('by-enterprise', 'enterprise_id');
        }
        // local_proxy_records store
        if (!db.objectStoreNames.contains('local_proxy_records')) {
          const store = db.createObjectStore('local_proxy_records', { keyPath: 'client_record_uuid' });
          store.createIndex('by-enterprise', 'enterprise_id');
          store.createIndex('by-status', 'sync_status');
        }
        // cluster_model_cache store
        if (!db.objectStoreNames.contains('cluster_model_cache')) {
          db.createObjectStore('cluster_model_cache', { keyPath: 'cluster_id' });
        }
        // sync_queue store
        if (!db.objectStoreNames.contains('sync_queue')) {
          const store = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
          store.createIndex('by-type', 'entity_type');
          store.createIndex('by-key', 'idempotency_key', { unique: true });
        }
      },
    });
  }
  return dbPromise;
}

// Enterprise helpers
export async function saveEnterpriseLocal(enterprise: Enterprise): Promise<string> {
  const db = await getDB();
  await db.put('local_enterprises', enterprise);
  return enterprise.client_id;
}

export async function getEnterpriseLocal(clientId: string): Promise<Enterprise | undefined> {
  const db = await getDB();
  return db.get('local_enterprises', clientId);
}

export async function getAllEnterprisesLocal(): Promise<Enterprise[]> {
  const db = await getDB();
  return db.getAll('local_enterprises');
}

// Consent helpers
export async function saveConsentLocal(consent: Consent): Promise<string> {
  const db = await getDB();
  await db.put('local_consents', consent);
  return consent.client_id;
}

export async function getConsentLocal(clientId: string): Promise<Consent | undefined> {
  const db = await getDB();
  return db.get('local_consents', clientId);
}

export async function getAllConsentsLocal(): Promise<Consent[]> {
  const db = await getDB();
  return db.getAll('local_consents');
}

// ProxyRecord helpers
export async function saveProxyRecordLocal(record: ProxyRecord): Promise<string> {
  const db = await getDB();
  await db.put('local_proxy_records', record);
  return record.client_record_uuid;
}

export async function getProxyRecordLocal(recordUuid: string): Promise<ProxyRecord | undefined> {
  const db = await getDB();
  return db.get('local_proxy_records', recordUuid);
}

export async function getDraftProxyRecords(): Promise<ProxyRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('local_proxy_records', 'by-status', 'draft');
}

export async function getAllProxyRecordsLocal(): Promise<ProxyRecord[]> {
  const db = await getDB();
  return db.getAll('local_proxy_records');
}

// Model Cache helpers
export async function cacheClusterModel(cacheData: ClusterModelCache): Promise<string> {
  const db = await getDB();
  await db.put('cluster_model_cache', cacheData);
  return cacheData.cluster_id;
}

export async function getCachedClusterModel(clusterId: string): Promise<ClusterModelCache | undefined> {
  const db = await getDB();
  return db.get('cluster_model_cache', clusterId);
}

export async function cacheAudioBundle(key: string, bundle: AudioBundle): Promise<string> {
  const db = await getDB();
  await db.put('cluster_model_cache', { ...bundle, cluster_id: key });
  return key;
}

export async function getCachedAudioBundle(key: string): Promise<AudioBundle | undefined> {
  const db = await getDB();
  return db.get('cluster_model_cache', key);
}


// Sync Queue helpers
export async function enqueueForSync(item: Omit<SyncQueueItem, 'id'>): Promise<number> {
  const db = await getDB();
  // Ensure no duplicate idempotency_key is queued
  const existing = await db.getFromIndex('sync_queue', 'by-key', item.idempotency_key);
  if (existing && existing.id !== undefined) {
    // Update existing payload/retry count instead of inserting duplicate
    existing.payload = item.payload;
    existing.retry_count = item.retry_count;
    await db.put('sync_queue', existing);
    return existing.id;
  }
  return db.add('sync_queue', item as SyncQueueItem);
}

export async function getSyncQueueItems(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAll('sync_queue');
}

export async function removeSyncQueueItem(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('sync_queue', id);
}
