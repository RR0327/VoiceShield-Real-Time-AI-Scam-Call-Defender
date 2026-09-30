import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY", "")
    
    # Read from Render environment, fallback to SQLite locally
    _db_url = os.getenv("DATABASE_URL", "sqlite:///./agent.db")
    
    # Ensure we use psycopg2 driver explicitly for SQLAlchemy
    if _db_url.startswith("postgres://"):
        _db_url = _db_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif _db_url.startswith("postgresql://") and not _db_url.startswith("postgresql+psycopg2://"):
        _db_url = _db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
        
    DATABASE_URL = _db_url

settings = Settings()
