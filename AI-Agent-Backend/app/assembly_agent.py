import assemblyai as aai
from app.config import settings

def init_assemblyai():
    if settings.ASSEMBLYAI_API_KEY:
        aai.settings.api_key = settings.ASSEMBLYAI_API_KEY
    else:
        print("WARNING: AssemblyAI API Key not found in .env")

def transcribe_audio(file_path: str) -> dict:
    """
    Transcribes an audio file using AssemblyAI and returns the text.
    """
    if not settings.ASSEMBLYAI_API_KEY:
        return {"text": "Error: AssemblyAI API key is missing."}
        
    try:
        transcriber = aai.Transcriber()
        transcript = transcriber.transcribe(file_path)
        
        if transcript.status == aai.TranscriptStatus.error:
            return {"text": f"Transcription error: {transcript.error}"}
            
        return {"text": transcript.text}
    except Exception as e:
        return {"text": f"Failed to transcribe: {str(e)}"}

def process_voice_input(input_text: str) -> dict:
    """
    Fallback for text-only input.
    """
    return {
        "text": input_text
    }

