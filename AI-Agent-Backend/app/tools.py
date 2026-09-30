from sqlalchemy.orm import Session
from app import models

def send_alert(db: Session, message: str, severity: str, category: str = "General Scam", risk_score: int = 0) -> models.Alert:
    """Save alert into SQLite with classification data."""
    db_alert = models.Alert(
        message=message, 
        severity=severity, 
        status="active",
        category=category,
        risk_score=risk_score
    )
    db.add(db_alert)
    db.commit()
    db.refresh(db_alert)
    return db_alert

def generate_report(db: Session, title: str, content: str) -> models.Report:
    """Create incident report entry and save into database."""
    db_report = models.Report(title=title, content=content)
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report

def log_event(db: Session, event_type: str, description: str) -> models.Event:
    """Save system activity event into database."""
    db_event = models.Event(event_type=event_type, description=description)
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event
