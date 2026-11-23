"""
ProtocolShield Synthetic Oncology Cohort Generator
Generates clinically calibrated, epidemiology-accurate NSCLC patient records
modeled after real-world RWD and SEER / Flatiron Health distributions.
"""
import numpy as np
import pandas as pd


def generate_synthetic_cohort(total_patients: int = 10000, seed: int = 42) -> pd.DataFrame:
    """
    Generates a deterministic cohort of N synthetic oncology patients
    with realistic clinical correlations (e.g. liver mets -> higher ALT/Bilirubin,
    elderly -> lower eGFR, rurality -> higher travel distance).
    """
    rng = np.random.default_rng(seed)

    # 1. Demographics
    ages = rng.normal(loc=65.5, scale=9.2, size=total_patients).astype(int)
    ages = np.clip(ages, 28, 91)
    
    genders = rng.choice(["Male", "Female"], size=total_patients, p=[0.53, 0.47])
    
    races = rng.choice(
        ["White", "Black or African American", "Asian", "Hispanic or Latino", "Other/Multiracial"],
        size=total_patients,
        p=[0.70, 0.14, 0.08, 0.06, 0.02]
    )
    
    rurality = rng.choice(["Urban", "Suburban", "Rural"], size=total_patients, p=[0.45, 0.38, 0.17])

    # 2. Oncology Profile
    cancer_types = rng.choice(
        ["NSCLC - Adenocarcinoma", "NSCLC - Squamous Cell", "NSCLC - Large Cell / Other"],
        size=total_patients,
        p=[0.68, 0.26, 0.06]
    )
    
    cancer_stages = rng.choice(
        ["Stage IIIB", "Stage IIIC", "Stage IV (Oligometastatic)", "Stage IV (Polymetastatic)"],
        size=total_patients,
        p=[0.12, 0.10, 0.33, 0.45]
    )
    
    # ECOG Performance: 0 (32%), 1 (48%), 2 (15%), 3 (4%), 4 (1%)
    ecog_scores = rng.choice([0, 1, 2, 3, 4], size=total_patients, p=[0.32, 0.48, 0.15, 0.04, 0.01])

    # 3. Biomarkers
    # EGFR mutations more prevalent in adenocarcinoma and females
    egfr_probs = np.where((cancer_types == "NSCLC - Adenocarcinoma") & (genders == "Female"), 0.28, 0.10)
    egfr_mutation = rng.random(total_patients) < egfr_probs
    
    alk_rearrangement = (~egfr_mutation) & (rng.random(total_patients) < 0.045)
    kras_g12c = (~egfr_mutation) & (~alk_rearrangement) & (rng.random(total_patients) < 0.13)
    
    # PD-L1 Tumor Proportion Score (TPS %)
    # ~35% < 1%, ~35% 1-49%, ~30% >= 50%
    pdl1_bracket = rng.choice(["negative", "low", "high"], size=total_patients, p=[0.35, 0.35, 0.30])
    pdl1_tps = np.zeros(total_patients)
    pdl1_tps[pdl1_bracket == "negative"] = 0.0
    pdl1_tps[pdl1_bracket == "low"] = rng.uniform(1.0, 49.0, size=np.sum(pdl1_bracket == "low"))
    pdl1_tps[pdl1_bracket == "high"] = rng.uniform(50.0, 100.0, size=np.sum(pdl1_bracket == "high"))
    pdl1_tps = np.round(pdl1_tps, 1)

    # 4. Clinical History & Metastatic Patterns
    has_brain_mets = rng.random(total_patients) < 0.24
    active_brain_mets = has_brain_mets & (rng.random(total_patients) < 0.42)
    stable_treated_brain_mets = has_brain_mets & (~active_brain_mets)
    
    active_autoimmune = rng.random(total_patients) < 0.075
    nyha_class = rng.choice([0, 1, 2, 3], size=total_patients, p=[0.82, 0.12, 0.05, 0.01])
    
    prior_lines = rng.choice([0, 1, 2, 3, 4], size=total_patients, p=[0.30, 0.44, 0.18, 0.06, 0.02])
    prior_io = (prior_lines > 0) & (rng.random(total_patients) < 0.72)

    # 5. Laboratory Values with Clinical Correlations
    # Age correlation with renal function
    egfr_base = 115 - (0.65 * ages)
    egfr_noise = rng.normal(0, 14, size=total_patients)
    egfr_ml_min = np.clip(np.round(egfr_base + egfr_noise, 1), 18.0, 125.0)
    
    # Serum Creatinine inversely correlated with eGFR
    serum_creatinine = np.round(np.clip(140.0 / (egfr_ml_min + 10.0) + rng.normal(0, 0.15, total_patients), 0.5, 4.8), 2)
    
    # Hematology
    anc = np.round(np.clip(rng.normal(3850, 1150, size=total_patients), 750, 9800), 0)
    platelets = np.round(np.clip(rng.normal(245, 68, size=total_patients), 38, 580), 0)
    hemoglobin = np.round(np.clip(rng.normal(12.7, 1.8, size=total_patients), 6.8, 17.5), 1)
    
    # Hepatic Panel (elevated in stage IV polymetastatic)
    has_liver_mets = (cancer_stages == "Stage IV (Polymetastatic)") & (rng.random(total_patients) < 0.38)
    
    alt_base = np.where(has_liver_mets, rng.normal(85, 35, total_patients), rng.normal(28, 12, total_patients))
    alt_u_l = np.round(np.clip(alt_base, 8.0, 240.0), 1)
    
    ast_base = np.where(has_liver_mets, rng.normal(78, 30, total_patients), rng.normal(26, 11, total_patients))
    ast_u_l = np.round(np.clip(ast_base, 9.0, 210.0), 1)
    
    bili_base = np.where(has_liver_mets, rng.normal(1.6, 0.6, total_patients), rng.normal(0.7, 0.25, total_patients))
    total_bilirubin = np.round(np.clip(bili_base, 0.2, 4.5), 2)

    # 6. Socioeconomic & Distance Factors
    dist_urban = rng.uniform(2.5, 22.0, total_patients)
    dist_suburban = rng.uniform(12.0, 48.0, total_patients)
    dist_rural = rng.uniform(35.0, 138.0, total_patients)
    
    distance_miles = np.where(rurality == "Urban", dist_urban, np.where(rurality == "Suburban", dist_suburban, dist_rural))
    distance_miles = np.round(distance_miles, 1)
    
    caregiver = np.where(rurality == "Rural", rng.random(total_patients) < 0.62, rng.random(total_patients) < 0.84)

    # Build DataFrame
    patient_ids = [f"SYN-PAT-{i:06d}" for i in range(1, total_patients + 1)]
    
    df = pd.DataFrame({
        "patient_id": patient_ids,
        "age": ages,
        "gender": genders,
        "race_ethnicity": races,
        "rurality": rurality,
        "primary_cancer_type": cancer_types,
        "cancer_stage": cancer_stages,
        "ecog_score": ecog_scores,
        "egfr_mutation": egfr_mutation,
        "alk_rearrangement": alk_rearrangement,
        "kras_g12c": kras_g12c,
        "pdl1_tps_percent": pdl1_tps,
        "anc": anc,
        "platelets": platelets,
        "hemoglobin": hemoglobin,
        "egfr_ml_min": egfr_ml_min,
        "serum_creatinine": serum_creatinine,
        "alt_u_l": alt_u_l,
        "ast_u_l": ast_u_l,
        "total_bilirubin": total_bilirubin,
        "prior_lines_therapy": prior_lines,
        "prior_checkpoint_inhibitor": prior_io,
        "active_brain_metastases": active_brain_mets,
        "stable_treated_brain_mets": stable_treated_brain_mets,
        "active_autoimmune_disease": active_autoimmune,
        "nyha_heart_failure_class": nyha_class,
        "distance_to_center_miles": distance_miles,
        "caregiver_accompanied": caregiver
    })
    
    return df


def seed_database_if_empty(total_patients: int = 10000) -> int:
    """Populates DuckDB with synthetic cohort if table is empty."""
    from app.db.duckdb_client import db_client
    count = db_client.count_patients()
    if count >= total_patients:
        return count
    
    df = generate_synthetic_cohort(total_patients=total_patients)
    conn = db_client.get_connection()
    try:
        conn.register("df_temp", df)
        conn.execute("INSERT OR REPLACE INTO patients SELECT * FROM df_temp")
        return db_client.count_patients()
    finally:
        conn.close()
