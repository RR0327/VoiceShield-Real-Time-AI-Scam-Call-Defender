from sqlalchemy.orm import Session
from app import models

def send_alert(db: Session, message: str, severity: str) -> models.Alert:
    """Save alert into SQLite and return success response."""
    db_alert = models.Alert(message=message, severity=severity, status="active")
    db.add(db_alert)
    db.commit()
    db.refresh(db_alert)
    return db_alert

def generate_report(db: Session, title: str, content: str) -> models.Report:
    """Create report entry and save into SQLite."""
    db_report = models.Report(title=title, content=content)
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report

def log_event(db: Session, event_type: str, description: str) -> models.Event:
    """Save system event into SQLite."""
    db_event = models.Event(event_type=event_type, description=description)
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event
