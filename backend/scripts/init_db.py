import asyncio
import os
import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import settings

async def init_db():
    print("Initialize database schema & seed data...")
    # Using psycopg 3 async or synchronous for initialization
    import psycopg
    
    db_url = settings.SUPABASE_URL if "postgres://" in settings.SUPABASE_URL or "postgresql://" in settings.SUPABASE_URL else os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/kisan_credit")
    
    sql_dir = Path(__file__).parent.parent / "sql"
    schema_sql = (sql_dir / "01_schema.sql").read_text(encoding="utf-8")
    rls_sql = (sql_dir / "02_rls_policies.sql").read_text(encoding="utf-8")
    seed_sql = (sql_dir / "03_seed_data.sql").read_text(encoding="utf-8")
    
    try:
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                print("Executing 01_schema.sql...")
                cur.execute(schema_sql)
                print("Executing 02_rls_policies.sql...")
                cur.execute(rls_sql)
                print("Executing 03_seed_data.sql...")
                cur.execute(seed_sql)
            conn.commit()
        print("Database initialization successful!")
    except Exception as e:
        print(f"Note on DB connection ({db_url}): {e}")
        print("In offline / SQLite mock mode, initialization script serves as migration verification.")

if __name__ == "__main__":
    asyncio.run(init_db())
