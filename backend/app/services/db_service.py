import sqlite3
import json
import os
from datetime import datetime, date
from typing import Dict, Any, List, Optional
from pathlib import Path

# Local SQLite storage engine for offline/local development & mock testing without external Postgres setup
DB_PATH = Path(__file__).parent.parent.parent / "data" / "local_mock.db"

def get_db_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_mock_db():
    conn = get_db_connection()
    cur = conn.cursor()
    
    # 1. institutions
    cur.execute("""
    CREATE TABLE IF NOT EXISTS institutions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        region TEXT NOT NULL
    );
    """)
    
    # 2. officers
    cur.execute("""
    CREATE TABLE IF NOT EXISTS officers (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        pin_hash TEXT NOT NULL,
        active BOOLEAN DEFAULT 1
    );
    """)
    
    # 3. clusters
    cur.execute("""
    CREATE TABLE IF NOT EXISTS clusters (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        uses_climate BOOLEAN DEFAULT 0
    );
    """)
    
    # 4. enterprises
    cur.execute("""
    CREATE TABLE IF NOT EXISTS enterprises (
        id TEXT PRIMARY KEY,
        client_id TEXT UNIQUE NOT NULL,
        institution_id TEXT NOT NULL,
        cluster_id TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        village TEXT,
        district TEXT,
        state TEXT,
        officer_id TEXT NOT NULL,
        client_submitted_at TEXT NOT NULL,
        server_received_at TEXT NOT NULL
    );
    """)
    
    # 5. consents
    cur.execute("""
    CREATE TABLE IF NOT EXISTS consents (
        id TEXT PRIMARY KEY,
        client_id TEXT UNIQUE NOT NULL,
        enterprise_id TEXT NOT NULL,
        method TEXT NOT NULL,
        language TEXT NOT NULL,
        consent_token TEXT NOT NULL,
        officer_id TEXT NOT NULL,
        client_submitted_at TEXT NOT NULL,
        server_received_at TEXT NOT NULL
    );
    """)
    
    # 6. proxy_records
    cur.execute("""
    CREATE TABLE IF NOT EXISTS proxy_records (
        id TEXT PRIMARY KEY,
        client_record_uuid TEXT UNIQUE NOT NULL,
        enterprise_id TEXT NOT NULL,
        officer_id TEXT NOT NULL,
        visit_date TEXT NOT NULL,
        client_submitted_at TEXT NOT NULL,
        server_received_at TEXT NOT NULL,
        physical_proxies TEXT NOT NULL,
        bounds_validated BOOLEAN NOT NULL DEFAULT 0,
        self_reported_signal REAL,
        climate_snapshot TEXT,
        forecast_result TEXT,
        discrepancy TEXT,
        officer_action TEXT,
        override_reason TEXT,
        sync_status TEXT NOT NULL
    );
    """)
    
    # 7. cluster_models
    cur.execute("""
    CREATE TABLE IF NOT EXISTS cluster_models (
        id TEXT PRIMARY KEY,
        cluster_id TEXT NOT NULL,
        version TEXT NOT NULL,
        forecast_model_js TEXT NOT NULL,
        risk_model_js TEXT NOT NULL,
        baseline_json TEXT NOT NULL,
        templates_json TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
        UNIQUE(cluster_id, version)
    );
    """)
    
    # 8. audit_logs
    cur.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        actor_id TEXT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)
    
    # Seed default institution & officer
    cur.execute("INSERT OR IGNORE INTO institutions (id, name, region) VALUES (?, ?, ?)",
                ("11111111-1111-1111-1111-111111111111", "Vidarbha Gramin Bank", "Vidarbha, Maharashtra"))
    
    # Check if test officer exists; if not, insert with valid passlib bcrypt hash or plain '1234'
    cur.execute("SELECT id FROM officers WHERE phone = ?", ("+919876543210",))
    if not cur.fetchone():
        try:
            from passlib.context import CryptContext
            ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
            pin_hash = ctx.hash("1234")
        except Exception:
            pin_hash = "1234"
        cur.execute("INSERT INTO officers (id, institution_id, name, phone, pin_hash, active) VALUES (?, ?, ?, ?, ?, ?)",
                    ("22222222-2222-2222-2222-222222222222", "11111111-1111-1111-1111-111111111111", "Rajesh Kumar (Field Officer)", "+919876543210", pin_hash, 1))
    
    # Seed Clusters
    cur.execute("INSERT OR IGNORE INTO clusters (id, name, uses_climate) VALUES (?, ?, ?)",
                ("33333333-3333-3333-3333-333333333333", "Dairy", 1))
    cur.execute("INSERT OR IGNORE INTO clusters (id, name, uses_climate) VALUES (?, ?, ?)",
                ("44444444-4444-4444-4444-444444444444", "Kirana / Rural Retail", 0))
    cur.execute("INSERT OR IGNORE INTO clusters (id, name, uses_climate) VALUES (?, ?, ?)",
                ("55555555-5555-5555-5555-555555555555", "Handicraft", 0))
    
    # Seed Dairy model
    forecast_js = """function score(input) {
    var livestock = (input.livestock_count === null || input.livestock_count === "") ? undefined : Number(input.livestock_count);
    var milk = (input.milk_volume_l_day === null || input.milk_volume_l_day === "") ? undefined : Number(input.milk_volume_l_day);
    var fodder = (input.fodder_expense_monthly === null || input.fodder_expense_monthly === "") ? undefined : Number(input.fodder_expense_monthly);
    
    var var0 = 220.0;
    if (livestock !== undefined) {
        if (livestock <= 3.5) {
            var0 += (milk !== undefined && milk > 15.0) ? 120.0 : 45.0;
        } else {
            var0 += (milk !== undefined && milk > 35.0) ? 450.0 : 280.0;
        }
    } else {
        var0 += (milk !== undefined) ? (milk * 8.0) : 50.0;
    }
    if (fodder !== undefined) {
        var0 -= (fodder * 0.1);
    }
    return Math.max(0, var0);
}"""
    risk_js = """function risk_score(input) {
    var cashFlow = score(input);
    if (cashFlow > 180.0) return 0;
    if (cashFlow > 120.0) return 1;
    return 2;
}"""
    baseline_json = json.dumps({"base_score": 220.0, "livestock_mean": 4, "milk_mean": 25.0, "fodder_mean": 3000.0})
    templates_json = json.dumps({
        "LOW": "Stable cash flow supported by consistent daily milk volume and healthy livestock scale.",
        "MEDIUM": "Moderate seasonal variance detected; verify local fodder costs and veterinary records.",
        "HIGH": "High risk of cash flow deficit due to low herd output or elevated operational overhead."
    })
    
    cur.execute("INSERT OR IGNORE INTO cluster_models (id, cluster_id, version, forecast_model_js, risk_model_js, baseline_json, templates_json, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ("66666666-6666-6666-6666-666666666666", "33333333-3333-3333-3333-333333333333", "v1.0-dairy", forecast_js, risk_js, baseline_json, templates_json, 1))
    
    # Seed Kirana model
    kirana_forecast_js = """function score(input) {
    var floor_area = (input.floor_area_sqft === null || input.floor_area_sqft === "") ? undefined : Number(input.floor_area_sqft);
    var skus = (input.skus_count === null || input.skus_count === "") ? undefined : Number(input.skus_count);
    var restock = (input.restock_freq_monthly === null || input.restock_freq_monthly === "") ? undefined : Number(input.restock_freq_monthly);
    var electricity = (input.electricity_bill_monthly === null || input.electricity_bill_monthly === "") ? undefined : Number(input.electricity_bill_monthly);
    
    var var0 = 350.0;
    if (floor_area !== undefined) {
        if (floor_area <= 120.0) {
            var0 += (skus !== undefined && skus > 80.0) ? 140.0 : 60.0;
        } else {
            var0 += (skus !== undefined && skus > 150.0) ? 380.0 : 210.0;
        }
    } else {
        var0 += (skus !== undefined) ? (skus * 2.0) : 75.0;
    }
    if (restock !== undefined) {
        var0 += restock * 15.0;
    }
    if (electricity !== undefined) {
        var0 -= (electricity * 0.15);
    }
    return Math.max(0, var0);
}"""
    kirana_risk_js = """function risk_score(input) {
    var cashFlow = score(input);
    if (cashFlow > 600.0) return 0;
    if (cashFlow > 450.0) return 1;
    return 2;
}"""
    kirana_baseline_json = json.dumps({"base_score": 350.0, "floor_area_sqft_mean": 150.0, "skus_count_mean": 110.0, "restock_freq_monthly_mean": 4.0})
    kirana_templates_json = json.dumps({
        "LOW": "Strong rural retail turnover supported by healthy floor area velocity and frequent monthly restocks.",
        "MEDIUM": "Moderate inventory turnover detected; check SKU breadth against local village footfall and seasonal patterns.",
        "HIGH": "High risk of cash flow stagnation due to limited stock variety or infrequent replenishment cycles."
    })
    
    cur.execute("INSERT OR IGNORE INTO cluster_models (id, cluster_id, version, forecast_model_js, risk_model_js, baseline_json, templates_json, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ("77777777-7777-7777-7777-777777777777", "44444444-4444-4444-4444-444444444444", "v1.0-kirana", kirana_forecast_js, kirana_risk_js, kirana_baseline_json, kirana_templates_json, 1))

    # Seed Handicraft model
    handicraft_forecast_js = """function score(input) {
    var artisans = (input.artisans_count === null || input.artisans_count === "") ? undefined : Number(input.artisans_count);
    var looms = (input.looms_equipment_count === null || input.looms_equipment_count === "") ? undefined : Number(input.looms_equipment_count);
    var raw_material = (input.raw_material_expense_monthly === null || input.raw_material_expense_monthly === "") ? undefined : Number(input.raw_material_expense_monthly);
    var days_order = (input.days_since_last_order === null || input.days_since_last_order === "") ? undefined : Number(input.days_since_last_order);
    
    var var0 = 280.0;
    if (artisans !== undefined) {
        if (artisans <= 2.5) {
            var0 += (looms !== undefined && looms > 1.5) ? 110.0 : 50.0;
        } else {
            var0 += (looms !== undefined && looms > 3.5) ? 360.0 : 220.0;
        }
    } else {
        var0 += (looms !== undefined) ? (looms * 40.0) : 60.0;
    }
    if (raw_material !== undefined) {
        var0 += (raw_material * 0.05);
    }
    if (days_order !== undefined && days_order > 30) {
        var0 -= ((days_order - 30) * 2.5);
    }
    return Math.max(0, var0);
}"""
    handicraft_risk_js = """function risk_score(input) {
    var cashFlow = score(input);
    if (cashFlow > 400.0) return 0;
    if (cashFlow > 250.0) return 1;
    return 2;
}"""
    handicraft_baseline_json = json.dumps({"base_score": 280.0, "artisans_count_mean": 3.0, "looms_equipment_count_mean": 2.0, "raw_material_expense_monthly_mean": 4500.0})
    handicraft_templates_json = json.dumps({
        "LOW": "Consistent artisan production capacity with active loom utilization and steady order frequency.",
        "MEDIUM": "Irregular order pipeline detected; verify raw material availability and buyer order history.",
        "HIGH": "High cash flow vulnerability driven by prolonged gap since last wholesale order or underutilized looms."
    })
    
    cur.execute("INSERT OR IGNORE INTO cluster_models (id, cluster_id, version, forecast_model_js, risk_model_js, baseline_json, templates_json, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ("88888888-8888-8888-8888-888888888888", "55555555-5555-5555-5555-555555555555", "v1.0-handicraft", handicraft_forecast_js, handicraft_risk_js, handicraft_baseline_json, handicraft_templates_json, 1))
    
    conn.commit()
    conn.close()

# Initialize DB on import
init_mock_db()
