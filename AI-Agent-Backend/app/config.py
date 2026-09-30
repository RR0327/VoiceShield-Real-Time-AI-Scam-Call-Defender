import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY", "")
    DATABASE_URL = "sqlite:///./agent.db"

settings = Settings()
