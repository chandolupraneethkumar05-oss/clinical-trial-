"""
ProtocolShield DuckDB Database Client
High-performance analytical vector database for 10,000+ patient records.
Thread-safe connection manager with cursor pooling to prevent file-locking collisions.
"""
import contextlib
import duckdb
import threading
from pathlib import Path
from app.core.config import settings


class ThreadSafeDuckDBCursor:
    """
    Thread-safe cursor proxy wrapping DuckDB connection cursor.
    Enforces thread safety with re-entrant lock and supports chaining:
    conn.execute(...).fetchone() / fetchall() / fetchdf().
    """
    def __init__(self, cursor: duckdb.DuckDBPyConnection, lock: threading.RLock):
        self._cursor = cursor
        self._lock = lock

    def execute(self, query: str, parameters=None):
        with self._lock:
            if parameters is not None:
                self._cursor.execute(query, parameters)
            else:
                self._cursor.execute(query)
            return self

    def fetchone(self):
        with self._lock:
            return self._cursor.fetchone()

    def fetchall(self):
        with self._lock:
            return self._cursor.fetchall()

    def fetchdf(self):
        with self._lock:
            return self._cursor.fetchdf()

    def register(self, name: str, df):
        with self._lock:
            return self._cursor.register(name, df)

    def close(self):
        try:
            self._cursor.close()
        except Exception:
            pass

    def __getattr__(self, name):
        return getattr(self._cursor, name)

    def __enter__(self):
        self._lock.acquire()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._lock.release()
        self.close()


class DuckDBClient:
    def __init__(self, db_path: Path = None):
        self.db_path = str(db_path or settings.DB_PATH)
        # Ensure parent directory exists
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._is_in_memory_fallback = False
        
        # Single persistent shared connection handle - cursors share this without file lock collisions
        try:
            self._shared_conn = duckdb.connect(self.db_path)
        except duckdb.IOException as exc:
            if settings.ENVIRONMENT in {"production", "prod"}:
                raise RuntimeError(
                    f"[STARTUP FAILURE] Production DuckDB database at {self.db_path} is locked by another process or unavailable ({exc}). "
                    "DuckDB file locking requires single-process execution (e.g. uvicorn --workers 1 or single-worker container). "
                    "In-memory fallback is disabled in production to prevent silent state loss."
                ) from exc
            import warnings
            warnings.warn(
                f"DuckDB database at {self.db_path} is locked by another process ({exc}). "
                "Initializing isolated in-memory DuckDB instance to ensure high availability.",
                RuntimeWarning
            )
            self.db_path = ":memory:"
            self._shared_conn = duckdb.connect(":memory:")
            self._is_in_memory_fallback = True

        self._init_schema()

    def get_connection(self) -> ThreadSafeDuckDBCursor:
        """Returns a thread-safe cursor sharing the open DuckDB database file."""
        with self._lock:
            cursor = self._shared_conn.cursor()
            return ThreadSafeDuckDBCursor(cursor, self._lock)

    @contextlib.contextmanager
    def transaction(self):
        """
        Context manager for atomic transaction execution on DuckDB.
        Yields a ThreadSafeDuckDBCursor within an active BEGIN TRANSACTION block.
        Automatically commits on normal exit, rolls back on exception.
        """
        with self._lock:
            conn = self.get_connection()
            conn.execute("BEGIN TRANSACTION")
            try:
                yield conn
                conn.execute("COMMIT")
            except Exception:
                try:
                    conn.execute("ROLLBACK")
                except Exception:
                    pass
                raise
            finally:
                conn.close()

    def _init_schema(self):
        """Initializes tables and analytical indices if they don't exist."""
        conn = self.get_connection()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS patients (
                    patient_id VARCHAR PRIMARY KEY,
                    age INTEGER,
                    gender VARCHAR,
                    race_ethnicity VARCHAR,
                    rurality VARCHAR,
                    primary_cancer_type VARCHAR,
                    cancer_stage VARCHAR,
                    ecog_score INTEGER,
                    egfr_mutation BOOLEAN,
                    alk_rearrangement BOOLEAN,
                    kras_g12c BOOLEAN,
                    pdl1_tps_percent DOUBLE,
                    anc DOUBLE,
                    platelets DOUBLE,
                    hemoglobin DOUBLE,
                    egfr_ml_min DOUBLE,
                    serum_creatinine DOUBLE,
                    alt_u_l DOUBLE,
                    ast_u_l DOUBLE,
                    total_bilirubin DOUBLE,
                    prior_lines_therapy INTEGER,
                    prior_checkpoint_inhibitor BOOLEAN,
                    active_brain_metastases BOOLEAN,
                    stable_treated_brain_mets BOOLEAN,
                    active_autoimmune_disease BOOLEAN,
                    nyha_heart_failure_class INTEGER,
                    distance_to_center_miles DOUBLE,
                    caregiver_accompanied BOOLEAN
                );

                CREATE TABLE IF NOT EXISTS users (
                    id VARCHAR PRIMARY KEY,
                    name VARCHAR NOT NULL,
                    email VARCHAR UNIQUE NOT NULL,
                    password_hash VARCHAR NOT NULL,
                    role VARCHAR DEFAULT 'doctor',
                    organization VARCHAR,
                    provider VARCHAR DEFAULT 'email',
                    token_version INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS password_resets (
                    id VARCHAR PRIMARY KEY,
                    email VARCHAR NOT NULL,
                    token_hash VARCHAR NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    used BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS token_blacklist (
                    jti VARCHAR PRIMARY KEY,
                    token_hash VARCHAR NOT NULL,
                    revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL
                );

                CREATE TABLE IF NOT EXISTS audit_logs (
                    id VARCHAR PRIMARY KEY,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    user_id VARCHAR,
                    user_name VARCHAR,
                    user_role VARCHAR,
                    action VARCHAR NOT NULL,
                    resource_type VARCHAR NOT NULL,
                    resource_id VARCHAR,
                    details VARCHAR,
                    previous_hash VARCHAR NOT NULL,
                    verification_hash VARCHAR NOT NULL
                );

                CREATE TABLE IF NOT EXISTS uploaded_protocols (
                    protocol_id VARCHAR PRIMARY KEY,
                    data_json VARCHAR NOT NULL,
                    uploaded_by VARCHAR NOT NULL,
                    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS patient_interests (
                    id VARCHAR PRIMARY KEY,
                    patient_id VARCHAR NOT NULL,
                    protocol_id VARCHAR NOT NULL,
                    patient_name VARCHAR,
                    patient_email VARCHAR,
                    status VARCHAR DEFAULT 'SUBMITTED',
                    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (patient_id, protocol_id)
                );
            """)

            # Safe schema upgrades for existing installations
            try:
                conn.execute("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1")
            except Exception:
                pass
            try:
                conn.execute("ALTER TABLE audit_logs ADD COLUMN previous_hash VARCHAR DEFAULT '0000000000000000000000000000000000000000000000000000000000000000'")
            except Exception:
                pass
            try:
                conn.execute("ALTER TABLE audit_logs ADD COLUMN verification_hash VARCHAR DEFAULT ''")
            except Exception:
                pass
        finally:
            conn.close()

        if getattr(self, "_is_in_memory_fallback", False):
            try:
                from app.engine.synthetic_data import generate_synthetic_cohort
                df = generate_synthetic_cohort(total_patients=1000)
                init_conn = self.get_connection()
                try:
                    init_conn.register("df_fallback_seed", df)
                    init_conn.execute("INSERT OR REPLACE INTO patients SELECT * FROM df_fallback_seed")
                finally:
                    init_conn.close()
            except Exception:
                pass

    def execute_query(self, query: str, params: tuple = None) -> list[dict]:
        """Executes SQL query and returns list of dict rows."""
        conn = self.get_connection()
        try:
            if params:
                result = conn.execute(query, params).fetchdf()
            else:
                result = conn.execute(query).fetchdf()
            return result.to_dict(orient="records")
        finally:
            conn.close()

    def count_patients(self) -> int:
        """Returns total patient records in database."""
        conn = self.get_connection()
        try:
            row = conn.execute("SELECT count(*) as count FROM patients").fetchone()
            return row[0] if row else 0
        finally:
            conn.close()


db_client = DuckDBClient()
