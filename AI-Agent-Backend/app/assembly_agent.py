import assemblyai as aai
from app.config import settings

def init_assemblyai():
    api_key = (settings.ASSEMBLYAI_API_KEY or "").strip()
    if api_key:
        aai.settings.api_key = api_key
    else:
        print("WARNING: AssemblyAI API Key not configured in .env")

def transcribe_audio(file_path: str) -> dict:
    """
    Transcribes an audio file using AssemblyAI SDK and returns structured result.
    """
    api_key = (settings.ASSEMBLYAI_API_KEY or "").strip()
    if not api_key:
        return {
            "success": False, 
            "text": "", 
            "error": "AssemblyAI API key is missing from backend configuration."
        }
        
    try:
        init_assemblyai()
        transcriber = aai.Transcriber()
        transcript = transcriber.transcribe(file_path)
        
        if transcript.status == aai.TranscriptStatus.error:
            return {
                "success": False, 
                "text": "", 
                "error": str(transcript.error or "Unknown transcription error")
            }
            
        return {
            "success": True, 
            "text": transcript.text or "", 
            "error": None
        }
    except Exception as e:
        return {
            "success": False, 
            "text": "", 
            "error": f"AssemblyAI transcription exception: {str(e)}"
        }

def process_voice_input(input_text: str) -> dict:
    """Fallback text processor."""
    return {
        "success": True,
        "text": input_text,
        "error": None
    }
