import {
  getSyncQueueItems,
  removeSyncQueueItem,
  getEnterpriseLocal,
  getProxyRecordLocal,
  saveEnterpriseLocal,
  saveProxyRecordLocal,
} from '../db/indexedDB';
import { getToken, getOfficerInfo } from './api';

const API_BASE_URL = 'http://localhost:8000/api/v1';

export interface SyncSummary {
  synced: number;
  conflicts: number;
  errors: number;
  messages: string[];
}

export async function syncOfflineQueue(): Promise<SyncSummary> {
  if (!navigator.onLine) {
    throw new Error('Device is currently offline. Will sync when connection is restored.');
  }

  const token = getToken();
  const officer = getOfficerInfo();
  if (!token || !officer) {
    throw new Error('No active officer session found. Please login.');
  }

  const queueItems = await getSyncQueueItems();
  if (queueItems.length === 0) {
    return { synced: 0, conflicts: 0, errors: 0, messages: ['Queue is empty. All items are up to date.'] };
  }

  const batchItems = queueItems.map((item) => ({
    entity_type: item.entity_type,
    idempotency_key: item.idempotency_key,
    payload: item.payload,
  }));

  const response = await fetch(`${API_BASE_URL}/sync/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      officer_id: officer.id,
      institution_id: officer.institution_id,
      items: batchItems,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Batch sync request failed' }));
    throw new Error(err.detail || 'Server error during sync');
  }

  const data = await response.json();
  const summary: SyncSummary = {
    synced: data.synced_count || 0,
    conflicts: data.conflict_count || 0,
    errors: data.error_count || 0,
    messages: [],
  };

  for (const res of data.results || []) {
    // Find the corresponding queue item
    const matchingQueueItem = queueItems.find((q) => q.idempotency_key === res.idempotency_key);
    if (!matchingQueueItem || matchingQueueItem.id === undefined) continue;

    if (res.status === 'synced') {
      // Update local storage status and remove from sync queue
      if (matchingQueueItem.entity_type === 'enterprise') {
        const ent = await getEnterpriseLocal(res.idempotency_key);
        if (ent) {
          ent.server_received_at = new Date().toISOString();
          await saveEnterpriseLocal(ent);
        }
      } else if (matchingQueueItem.entity_type === 'proxy_record') {
        const proxy = await getProxyRecordLocal(res.idempotency_key);
        if (proxy) {
          proxy.sync_status = 'synced';
          proxy.server_received_at = new Date().toISOString();
          await saveProxyRecordLocal(proxy);
        }
      }
      await removeSyncQueueItem(matchingQueueItem.id);
      summary.messages.push(`✓ Synced ${res.entity_type} (${res.idempotency_key.slice(0, 8)})`);
    } else if (res.status === 'conflict') {
      if (matchingQueueItem.entity_type === 'proxy_record') {
        const proxy = await getProxyRecordLocal(res.idempotency_key);
        if (proxy) {
          proxy.sync_status = 'conflict';
          await saveProxyRecordLocal(proxy);
        }
      }
      await removeSyncQueueItem(matchingQueueItem.id);
      summary.messages.push(`⚠ Conflict for ${res.entity_type}: ${res.message}`);
    } else {
      summary.messages.push(`✕ Error syncing ${res.entity_type}: ${res.message}`);
    }
  }

  return summary;
}
