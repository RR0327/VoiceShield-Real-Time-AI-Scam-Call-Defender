import os
import shutil
import uuid
from typing import List, Optional
from fastapi import FastAPI, Depends, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from app import models, schemas, database, reasoning_engine, tools, assembly_agent

# Initialize database schema and auto-migrate SQLite if needed
models.Base.metadata.create_all(bind=database.engine)

def auto_migrate():
    """Ensure newly added columns exist in existing SQLite databases."""
    try:
        with database.engine.connect() as conn:
            # Check alerts table columns
            result = conn.execute(text("PRAGMA table_info(alerts)"))
            columns = [row[1] for row in result.fetchall()]
            if "category" not in columns:
                conn.execute(text("ALTER TABLE alerts ADD COLUMN category VARCHAR DEFAULT 'General'"))
            if "risk_score" not in columns:
                conn.execute(text("ALTER TABLE alerts ADD COLUMN risk_score INTEGER DEFAULT 0"))
            conn.commit()
    except Exception as e:
        print(f"Migration note (non-critical): {e}")

auto_migrate()

app = FastAPI(
    title="VoiceShield AI Scam Defender API",
    description="Real-time speech-to-text, scam intent reasoning engine, and alert monitoring.",
    version="2.0.0"
)

# Enable CORS for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize AssemblyAI client
assembly_agent.init_assemblyai()

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "VoiceShield AI Scam Call Defender API",
        "version": "2.0.0"
    }

@app.get("/stats", response_model=schemas.SystemStats)
def get_stats(db: Session = Depends(database.get_db)):
    total_alerts = db.query(models.Alert).count()
    active_threats = db.query(models.Alert).filter(models.Alert.status == "active").count()
    total_events = db.query(models.Event).count()
    total_reports = db.query(models.Report).count()
    return {
        "total_alerts": total_alerts,
        "active_threats": active_threats,
        "total_events": total_events,
        "total_reports": total_reports
    }

@app.post("/agent/query", response_model=schemas.QueryResponse)
def handle_query(query: schemas.QueryInput, db: Session = Depends(database.get_db)):
    # 1. AI Reasoning Engine Analysis
    analysis = reasoning_engine.analyze_request(query.message)
    
    # 2. Tool Execution
    tool = analysis["tool"]
    action_result = "Analysis complete"
    response_text = analysis["recommended_action"]
    
    if tool == "send_alert":
        tools.send_alert(
            db, 
            message=query.message, 
            severity=analysis["severity"],
            category=analysis["scam_category"],
            risk_score=analysis["risk_score"]
        )
        action_result = f"🚨 {analysis['severity'].upper()} threat logged to defender database"
    elif tool == "generate_report":
        tools.generate_report(db, title="Incident Analysis Report", content=query.message)
        action_result = "Incident report generated and logged"
    elif tool == "log_event":
        tools.log_event(db, event_type="Call Monitoring", description=query.message)
        action_result = "Call event logged safely"
        
    return {
        "decision": analysis["intent"],
        "action": tool,
        "severity": analysis["severity"],
        "result": action_result,
        "response_text": response_text,
        "transcript": query.message,
        "risk_score": analysis["risk_score"],
        "scam_category": analysis["scam_category"],
        "red_flags": analysis["red_flags"],
        "recommended_action": analysis["recommended_action"]
    }

@app.post("/agent/voice", response_model=schemas.QueryResponse)
def handle_voice(audio: UploadFile = File(...), db: Session = Depends(database.get_db)):
    # Unique safe temporary file path
    ext = os.path.splitext(audio.filename or "")[1] or ".webm"
    temp_filename = f"temp_{uuid.uuid4().hex}{ext}"
    
    try:
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(audio.file, buffer)
            
        file_size = os.path.getsize(temp_filename)
        if file_size < 100:
            return {
                "decision": "silence",
                "action": "none",
                "severity": "low",
                "result": "Audio recording was empty. Check microphone permissions.",
                "response_text": "Could not capture audio from microphone. Please ensure microphone access is granted and speak clearly.",
                "transcript": "",
                "risk_score": 0,
                "scam_category": "Empty Audio Recording",
                "red_flags": [],
                "recommended_action": "Ensure microphone is unmuted and permission is granted in browser."
            }

        # Transcribe with AssemblyAI
        transcription = assembly_agent.transcribe_audio(temp_filename)
    finally:
        if os.path.exists(temp_filename):
            try:
                os.remove(temp_filename)
            except Exception:
                pass

    if not transcription.get("success"):
        err_msg = transcription.get("error", "Transcription failed")
        return {
            "decision": "error",
            "action": "none",
            "severity": "low",
            "result": f"Audio processing error: {err_msg}",
            "response_text": f"Voice transcription issue: {err_msg}",
            "transcript": "",
            "risk_score": 0,
            "scam_category": "Audio Processing Error",
            "red_flags": [],
            "recommended_action": "Check microphone settings or AssemblyAI API credentials in backend."
        }

    transcribed_text = transcription.get("text", "").strip()
    if not transcribed_text:
        return {
            "decision": "silence",
            "action": "none",
            "severity": "low",
            "result": "No speech detected in audio clip",
            "response_text": "Could not detect clear speech. Please speak closer to the microphone.",
            "transcript": "",
            "risk_score": 0,
            "scam_category": "Unclear Audio",
            "red_flags": [],
            "recommended_action": "Please try speaking again."
        }

    # Pass transcribed voice into reasoning engine
    analysis = reasoning_engine.analyze_request(transcribed_text)
    tool = analysis["tool"]
    action_result = "Voice analysis complete"
    response_text = analysis["recommended_action"]
    
    if tool == "send_alert":
        tools.send_alert(
            db, 
            message=transcribed_text, 
            severity=analysis["severity"],
            category=analysis["scam_category"],
            risk_score=analysis["risk_score"]
        )
        action_result = f"🚨 {analysis['severity'].upper()} scam threat logged to database"
    elif tool == "generate_report":
        tools.generate_report(db, title="Voice Incident Report", content=transcribed_text)
        action_result = "Voice incident report recorded"
    elif tool == "log_event":
        tools.log_event(db, event_type="Voice Monitoring", description=transcribed_text)
        action_result = "Voice stream recorded safely"

    return {
        "decision": analysis["intent"],
        "action": tool,
        "severity": analysis["severity"],
        "result": action_result,
        "response_text": response_text,
        "transcript": transcribed_text,
        "risk_score": analysis["risk_score"],
        "scam_category": analysis["scam_category"],
        "red_flags": analysis["red_flags"],
        "recommended_action": analysis["recommended_action"]
    }

@app.get("/alerts", response_model=List[schemas.Alert])
def get_alerts(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    alerts = db.query(models.Alert).order_by(models.Alert.id.desc()).offset(skip).limit(limit).all()
    return alerts

@app.patch("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(database.get_db)):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = "resolved"
    db.commit()
    return {"message": "Alert marked as resolved", "id": alert_id}

@app.delete("/alerts/{alert_id}")
def delete_alert(alert_id: int, db: Session = Depends(database.get_db)):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    db.delete(alert)
    db.commit()
    return {"message": "Alert deleted", "id": alert_id}

@app.delete("/alerts")
def clear_all_alerts(db: Session = Depends(database.get_db)):
    db.query(models.Alert).delete()
    db.commit()
    return {"message": "All alerts cleared"}

@app.get("/reports", response_model=List[schemas.Report])
def get_reports(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    reports = db.query(models.Report).order_by(models.Report.id.desc()).offset(skip).limit(limit).all()
    return reports

@app.get("/events", response_model=List[schemas.Event])
def get_events(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    events = db.query(models.Event).order_by(models.Event.id.desc()).offset(skip).limit(limit).all()
    return events
