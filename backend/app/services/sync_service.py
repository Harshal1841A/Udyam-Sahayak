import json
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from app.schemas.models import SyncBatchRequest, SyncBatchResponse, SyncItemResult
from app.services.db_service import get_db_connection

def log_audit(conn, event_type: str, actor_id: str, entity_type: str, entity_id: str, payload: Dict[str, Any]):
    audit_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO audit_logs (id, event_type, actor_id, entity_type, entity_id, payload, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (audit_id, event_type, actor_id, entity_type, entity_id, json.dumps(payload), now))

def process_sync_batch(batch: SyncBatchRequest, current_officer_id: str) -> SyncBatchResponse:
    conn = get_db_connection()
    cur = conn.cursor()
    
    synced_count = 0
    conflict_count = 0
    error_count = 0
    results: List[SyncItemResult] = []
    
    now_iso = datetime.now(timezone.utc).isoformat()
    
    for item in batch.items:
        try:
            if item.entity_type == "enterprise":
                data = item.payload
                client_id = item.idempotency_key
                # Check if enterprise exists
                cur.execute("SELECT id FROM enterprises WHERE client_id = ?", (client_id,))
                existing = cur.fetchone()
                if existing:
                    results.append(SyncItemResult(
                        idempotency_key=client_id,
                        entity_type="enterprise",
                        status="synced",
                        server_id=existing["id"],
                        message="Enterprise already synced (idempotent)."
                    ))
                    synced_count += 1
                else:
                    new_id = str(uuid.uuid4())
                    cur.execute("""
                        INSERT INTO enterprises (
                            id, client_id, institution_id, cluster_id, owner_name,
                            village, district, state, officer_id, client_submitted_at, server_received_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        new_id, client_id, batch.institution_id, data.get("cluster_id"), data.get("owner_name"),
                        data.get("village"), data.get("district"), data.get("state"), current_officer_id,
                        data.get("client_submitted_at", now_iso), now_iso
                    ))
                    log_audit(conn, "ENTERPRISE_CREATED", current_officer_id, "enterprise", new_id, data)
                    results.append(SyncItemResult(
                        idempotency_key=client_id,
                        entity_type="enterprise",
                        status="synced",
                        server_id=new_id,
                        message="Enterprise created successfully."
                    ))
                    synced_count += 1
                    
            elif item.entity_type == "consent":
                data = item.payload
                client_id = item.idempotency_key
                cur.execute("SELECT id FROM consents WHERE client_id = ?", (client_id,))
                existing = cur.fetchone()
                if existing:
                    results.append(SyncItemResult(
                        idempotency_key=client_id,
                        entity_type="consent",
                        status="synced",
                        server_id=existing["id"],
                        message="Consent already synced (idempotent)."
                    ))
                    synced_count += 1
                else:
                    new_id = str(uuid.uuid4())
                    cur.execute("""
                        INSERT INTO consents (
                            id, client_id, enterprise_id, method, language, consent_token,
                            officer_id, client_submitted_at, server_received_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        new_id, client_id, data.get("enterprise_id"), data.get("method"), data.get("language"),
                        data.get("consent_token"), current_officer_id, data.get("client_submitted_at", now_iso), now_iso
                    ))
                    log_audit(conn, "CONSENT_RECORDED", current_officer_id, "consent", new_id, data)
                    results.append(SyncItemResult(
                        idempotency_key=client_id,
                        entity_type="consent",
                        status="synced",
                        server_id=new_id,
                        message="Consent recorded successfully."
                    ))
                    synced_count += 1
                    
            elif item.entity_type == "proxy_record":
                data = item.payload
                client_uuid = item.idempotency_key
                cur.execute("SELECT id, officer_action, sync_status FROM proxy_records WHERE client_record_uuid = ?", (client_uuid,))
                existing = cur.fetchone()
                if existing:
                    # Enforce strict immutability: if officer_action is already set (CONFIRM/OVERRIDE) and synced, cannot update
                    if existing["officer_action"] is not None and existing["sync_status"] == "synced":
                        results.append(SyncItemResult(
                            idempotency_key=client_uuid,
                            entity_type="proxy_record",
                            status="conflict",
                            server_id=existing["id"],
                            message="Record already finalized and confirmed/overridden by officer. Immutable post-finalization."
                        ))
                        conflict_count += 1
                    else:
                        # Update draft or unconfirmed record
                        cur.execute("""
                            UPDATE proxy_records SET
                                physical_proxies = ?, bounds_validated = ?, self_reported_signal = ?,
                                climate_snapshot = ?, forecast_result = ?, discrepancy = ?,
                                officer_action = ?, override_reason = ?, sync_status = 'synced',
                                server_received_at = ?
                            WHERE client_record_uuid = ?
                        """, (
                            json.dumps(data.get("physical_proxies", {})), bool(data.get("bounds_validated", False)),
                            data.get("self_reported_signal"), json.dumps(data.get("climate_snapshot")) if data.get("climate_snapshot") else None,
                            json.dumps(data.get("forecast_result")) if data.get("forecast_result") else None,
                            json.dumps(data.get("discrepancy")) if data.get("discrepancy") else None,
                            data.get("officer_action"), data.get("override_reason"), now_iso, client_uuid
                        ))
                        log_audit(conn, "PROXY_RECORD_UPDATED", current_officer_id, "proxy_record", existing["id"], data)
                        results.append(SyncItemResult(
                            idempotency_key=client_uuid,
                            entity_type="proxy_record",
                            status="synced",
                            server_id=existing["id"],
                            message="Proxy record updated and synced."
                        ))
                        synced_count += 1
                else:
                    new_id = str(uuid.uuid4())
                    cur.execute("""
                        INSERT INTO proxy_records (
                            id, client_record_uuid, enterprise_id, officer_id, visit_date,
                            client_submitted_at, server_received_at, physical_proxies, bounds_validated,
                            self_reported_signal, climate_snapshot, forecast_result, discrepancy,
                            officer_action, override_reason, sync_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
                    """, (
                        new_id, client_uuid, data.get("enterprise_id"), current_officer_id, data.get("visit_date", now_iso[:10]),
                        data.get("client_submitted_at", now_iso), now_iso, json.dumps(data.get("physical_proxies", {})),
                        bool(data.get("bounds_validated", False)), data.get("self_reported_signal"),
                        json.dumps(data.get("climate_snapshot")) if data.get("climate_snapshot") else None,
                        json.dumps(data.get("forecast_result")) if data.get("forecast_result") else None,
                        json.dumps(data.get("discrepancy")) if data.get("discrepancy") else None,
                        data.get("officer_action"), data.get("override_reason")
                    ))
                    log_audit(conn, "PROXY_RECORD_CREATED", current_officer_id, "proxy_record", new_id, data)
                    results.append(SyncItemResult(
                        idempotency_key=client_uuid,
                        entity_type="proxy_record",
                        status="synced",
                        server_id=new_id,
                        message="Proxy record created and synced."
                    ))
                    synced_count += 1
            else:
                results.append(SyncItemResult(
                    idempotency_key=item.idempotency_key,
                    entity_type=item.entity_type,
                    status="error",
                    message=f"Unknown entity_type: {item.entity_type}"
                ))
                error_count += 1
        except Exception as e:
            results.append(SyncItemResult(
                idempotency_key=item.idempotency_key,
                entity_type=item.entity_type,
                status="error",
                message=str(e)
            ))
            error_count += 1
            
    conn.commit()
    conn.close()
    
    return SyncBatchResponse(
        synced_count=synced_count,
        conflict_count=conflict_count,
        error_count=error_count,
        results=results
    )
