import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY", "")
    
    # Read from Render environment, fallback to SQLite locally
    _db_url = os.getenv("DATABASE_URL", "sqlite:///./agent.db")
    
    # SQLAlchemy 1.4+ requires "postgresql://" instead of "postgres://"
    if _db_url.startswith("postgres://"):
        _db_url = _db_url.replace("postgres://", "postgresql://", 1)
        
    DATABASE_URL = _db_url

settings = Settings()
