from fastapi import FastAPI, Depends, File, UploadFile
from sqlalchemy.orm import Session
from app import models, schemas, database, reasoning_engine, tools, assembly_agent
from typing import List
import shutil
import os

from fastapi.middleware.cors import CORSMiddleware

# Create database tables
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="AI Agent Monitoring System")

# Enable CORS for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize AssemblyAI (Mocked for MVP)
assembly_agent.init_assemblyai()

@app.get("/")
def read_root():
    return {
        "status": "running",
        "service": "AI Agent Backend"
    }

@app.post("/agent/query", response_model=schemas.QueryResponse)
def handle_query(query: schemas.QueryInput, db: Session = Depends(database.get_db)):
    # 2. Reasoning Engine
    analysis = reasoning_engine.analyze_request(query.message)
    
    # 3. Tool Selection & Execution
    tool = analysis["tool"]
    action_result = "Action executed successfully"
    response_text = f"Analysis: {analysis['reason']}."
    
    if tool == "send_alert":
        tools.send_alert(db, message=query.message, severity=analysis["severity"])
        action_result = "Alert saved to SQLite"
        response_text = f"🚨 SCAM/THREAT DETECTED! Reason: {analysis['reason']}. Alert triggered!"
    elif tool == "generate_report":
        tools.generate_report(db, title="Generated Report", content=query.message)
        action_result = "Report saved to SQLite"
        response_text = "📄 Report generated successfully."
    elif tool == "log_event":
        tools.log_event(db, event_type="User Query", description=query.message)
        action_result = "Event logged to SQLite"
        response_text = f"📝 Logged safely: {analysis['reason']}"
        
    return {
        "decision": analysis["intent"],
        "action": tool,
        "severity": analysis["severity"],
        "result": action_result,
        "response_text": response_text
    }

@app.post("/agent/voice")
def handle_voice(audio: UploadFile = File(...), db: Session = Depends(database.get_db)):
    # Save audio temporarily
    temp_file = f"temp_{audio.filename}"
    with open(temp_file, "wb") as buffer:
        shutil.copyfileobj(audio.file, buffer)
        
    # Transcribe using AssemblyAI
    transcript_result = assembly_agent.transcribe_audio(temp_file)
    if os.path.exists(temp_file):
        os.remove(temp_file)
    
    transcribed_text = transcript_result.get("text", "")
    if "Error" in transcribed_text or "Failed" in transcribed_text:
        return {
            "decision": "error",
            "action": "none",
            "severity": "low",
            "result": transcribed_text,
            "response_text": f"Transcription failed: {transcribed_text}",
            "transcript": ""
        }
        
    # Reasoning Engine
    analysis = reasoning_engine.analyze_request(transcribed_text)
    
    # Tool Selection & Execution
    tool = analysis["tool"]
    action_result = "Action executed successfully"
    response_text = f"Analysis: {analysis['reason']}."
    
    if tool == "send_alert":
        tools.send_alert(db, message=transcribed_text, severity=analysis["severity"])
        action_result = "Alert saved to SQLite"
        response_text = f"🚨 SCAM/THREAT DETECTED! Reason: {analysis['reason']}. Alert triggered!"
    elif tool == "generate_report":
        tools.generate_report(db, title="Generated Report", content=transcribed_text)
        action_result = "Report saved to SQLite"
        response_text = "📄 Report generated successfully."
    elif tool == "log_event":
        tools.log_event(db, event_type="User Query", description=transcribed_text)
        action_result = "Event logged to SQLite"
        response_text = f"📝 Logged safely: {analysis['reason']}"
        
    return {
        "decision": analysis["intent"],
        "action": tool,
        "severity": analysis["severity"],
        "result": action_result,
        "response_text": response_text,
        "transcript": transcribed_text
    }

@app.get("/alerts", response_model=List[schemas.Alert])
def get_alerts(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    alerts = db.query(models.Alert).offset(skip).limit(limit).all()
    return alerts

@app.get("/reports", response_model=List[schemas.Report])
def get_reports(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    reports = db.query(models.Report).offset(skip).limit(limit).all()
    return reports

@app.get("/events", response_model=List[schemas.Event])
def get_events(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    events = db.query(models.Event).offset(skip).limit(limit).all()
    return events
