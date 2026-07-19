import json
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status
from app.schemas.models import (
    AdminDiscrepancyItem,
    AdminEnterpriseDetail,
    AdminAuditLogItem
)
from app.services.db_service import get_db_connection

router = APIRouter()

@router.get("/portfolio", summary="Fetch Portfolio Overview Metrics & Attention Queue for Institution Dashboard")
async def get_portfolio_summary():
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Total enterprises
    cur.execute("SELECT COUNT(*) as cnt FROM enterprises")
    total_enterprises = cur.fetchone()["cnt"]
    
    # Active assessments (synced or pending with forecast_result)
    cur.execute("SELECT COUNT(*) as cnt FROM proxy_records WHERE forecast_result IS NOT NULL")
    active_assessments = cur.fetchone()["cnt"]
    
    # Risk breakdown from forecast_result JSON
    cur.execute("SELECT forecast_result, discrepancy, sync_status FROM proxy_records WHERE forecast_result IS NOT NULL")
    rows = cur.fetchall()
    
    risk_breakdown = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    needs_attention_count = 0
    attention_items: List[Dict[str, Any]] = []
    
    # To enrich attention items with enterprise names and cluster names
    cur.execute("""
        SELECT pr.client_record_uuid, pr.enterprise_id, pr.visit_date, pr.forecast_result, pr.discrepancy, pr.sync_status,
               e.owner_name, e.village, c.name as cluster_name
        FROM proxy_records pr
        JOIN enterprises e ON e.id = pr.enterprise_id
        JOIN clusters c ON c.id = e.cluster_id
        WHERE pr.forecast_result IS NOT NULL
        ORDER BY pr.server_received_at DESC
    """)
    enriched_rows = cur.fetchall()
    conn.close()
    
    for r in enriched_rows:
        f_res = json.loads(r["forecast_result"]) if isinstance(r["forecast_result"], str) else r["forecast_result"]
        disc = json.loads(r["discrepancy"]) if isinstance(r["discrepancy"], str) else r["discrepancy"]
        
        tier = (f_res.get("risk_tier") or "LOW").upper() if f_res else "LOW"
        if tier in risk_breakdown:
            risk_breakdown[tier] += 1
        else:
            risk_breakdown["LOW"] += 1
            
        # Check attention triggers: flagged discrepancy or HIGH risk
        is_flagged = disc and (disc.get("flagged") is True or str(disc.get("flagged")).lower() == "true")
        if is_flagged or tier == "HIGH" or r["sync_status"] in ("conflict", "pending"):
            needs_attention_count += 1
            attention_items.append({
                "client_record_uuid": r["client_record_uuid"],
                "enterprise_id": r["enterprise_id"],
                "owner_name": r["owner_name"],
                "village": r["village"],
                "cluster_name": r["cluster_name"],
                "visit_date": r["visit_date"],
                "risk_tier": tier,
                "is_flagged": is_flagged,
                "sync_status": r["sync_status"],
                "discrepancy_reason": disc.get("reason") if disc else None
            })
            
    return {
        "total_enterprises": total_enterprises,
        "active_assessments": active_assessments,
        "risk_breakdown": risk_breakdown,
        "needs_attention_count": needs_attention_count,
        "attention_queue": attention_items[:20]  # top 20 priority items
    }

@router.get("/discrepancies", response_model=List[AdminDiscrepancyItem], summary="Fetch All Discrepancy Records for Admin Log")
async def get_discrepancies():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT pr.client_record_uuid, pr.enterprise_id, pr.visit_date, pr.discrepancy, pr.self_reported_signal,
               pr.officer_action, pr.override_reason, e.owner_name, c.name as cluster_name
        FROM proxy_records pr
        JOIN enterprises e ON e.id = pr.enterprise_id
        JOIN clusters c ON c.id = e.cluster_id
        WHERE pr.discrepancy IS NOT NULL
        ORDER BY pr.server_received_at DESC
    """)
    rows = cur.fetchall()
    conn.close()
    
    results: List[AdminDiscrepancyItem] = []
    for r in rows:
        disc = json.loads(r["discrepancy"]) if isinstance(r["discrepancy"], str) else r["discrepancy"]
        if not disc:
            continue
        is_flagged = disc.get("flagged") is True or str(disc.get("flagged")).lower() == "true"
        if is_flagged:
            results.append(AdminDiscrepancyItem(
                client_record_uuid=r["client_record_uuid"],
                enterprise_id=r["enterprise_id"],
                enterprise_name=r["owner_name"],
                cluster_name=r["cluster_name"],
                visit_date=str(r["visit_date"]),
                reported_value=disc.get("reported_value", r["self_reported_signal"]),
                expected_range=disc.get("expected_range"),
                multiple=disc.get("multiple"),
                reason=disc.get("reason"),
                officer_action=r["officer_action"],
                override_reason=r["override_reason"]
            ))
            
    return results

@router.get("/enterprises/{enterprise_id}", response_model=AdminEnterpriseDetail, summary="Fetch Complete Timeline and History for an Enterprise")
async def get_enterprise_detail(enterprise_id: str):
    conn = get_db_connection()
    cur = conn.cursor()
    
    cur.execute("""
        SELECT e.*, c.name as cluster_name
        FROM enterprises e
        LEFT JOIN clusters c ON c.id = e.cluster_id
        WHERE e.id = ? OR e.client_id = ?
    """, (enterprise_id, enterprise_id))
    ent_row = cur.fetchone()
    
    if not ent_row:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Enterprise not found: {enterprise_id}"
        )
        
    resolved_id = ent_row["id"]
    
    cur.execute("""
        SELECT * FROM proxy_records WHERE enterprise_id = ? ORDER BY visit_date DESC, server_received_at DESC
    """, (resolved_id,))
    assessments = [dict(r) for r in cur.fetchall()]
    for a in assessments:
        for json_field in ("physical_proxies", "climate_snapshot", "forecast_result", "discrepancy"):
            if a.get(json_field) and isinstance(a[json_field], str):
                try:
                    a[json_field] = json.loads(a[json_field])
                except Exception:
                    pass
                    
    cur.execute("""
        SELECT * FROM consents WHERE enterprise_id = ? ORDER BY client_submitted_at DESC
    """, (resolved_id,))
    consents = [dict(r) for r in cur.fetchall()]
    conn.close()
    
    return AdminEnterpriseDetail(
        enterprise=dict(ent_row),
        assessments=assessments,
        consents=consents
    )

@router.get("/audit-logs", response_model=List[AdminAuditLogItem], summary="Fetch Searchable Paginated Audit Trail Ledger")
async def get_audit_logs(limit: int = 100):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT al.id, al.event_type, al.actor_id, al.entity_type, al.entity_id, al.payload, al.created_at
        FROM audit_logs al
        ORDER BY al.created_at DESC
        LIMIT ?
    """, (limit,))
    rows = cur.fetchall()
    conn.close()
    
    results: List[AdminAuditLogItem] = []
    for r in rows:
        payload = json.loads(r["payload"]) if isinstance(r["payload"], str) and r["payload"] else r["payload"]
        actor_id = str(r["actor_id"]) if r["actor_id"] else "SYSTEM"
        actor_type = "SYSTEM" if actor_id == "SYSTEM" else "OFFICER"
        enterprise_id = str(r["entity_id"]) if r["entity_type"] == "enterprise" else None
        
        results.append(AdminAuditLogItem(
            id=str(r["id"]),
            enterprise_id=enterprise_id,
            actor_type=actor_type,
            actor_name=f"Officer ({actor_id[:8]})" if actor_type == "OFFICER" else "System Service",
            event_type=r["event_type"],
            payload=payload if isinstance(payload, dict) else {"raw": payload} if payload else None,
            created_at=str(r["created_at"])
        ))
        
    return results
