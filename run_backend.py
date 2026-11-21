"""
ProtocolShield Backend Dev Runner
Ensures 'backend' is on sys.path and boots Uvicorn on http://127.0.0.1:8000
"""
import sys
from pathlib import Path

# Add backend directory to Python path
backend_path = Path(__file__).resolve().parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

import uvicorn

if __name__ == "__main__":
    print("[*] Starting ProtocolShield Intelligence Backend on http://127.0.0.1:8000 ...")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True, reload_dirs=[str(backend_path)])
