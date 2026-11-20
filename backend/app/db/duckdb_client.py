"""
ProtocolShield DuckDB Database Client
High-performance analytical vector database for 10,000+ patient records.
"""
import duckdb
from pathlib import Path
from app.core.config import settings


class DuckDBClient:
    def __init__(self, db_path: Path = None):
        self.db_path = str(db_path or settings.DB_PATH)
        # Ensure parent directory exists
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def get_connection(self) -> duckdb.DuckDBPyConnection:
        """Returns a connection to the DuckDB database."""
        return duckdb.connect(self.db_path)

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
            """)
        finally:
            conn.close()

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
