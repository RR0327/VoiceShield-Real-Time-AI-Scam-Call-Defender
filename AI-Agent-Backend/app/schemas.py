from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class AlertBase(BaseModel):
    message: str
    severity: str
    status: Optional[str] = "active"

class AlertCreate(AlertBase):
    pass

class Alert(AlertBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class EventBase(BaseModel):
    event_type: str
    description: str

class EventCreate(EventBase):
    pass

class Event(EventBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ReportBase(BaseModel):
    title: str
    content: str

class ReportCreate(ReportBase):
    pass

class Report(ReportBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class QueryInput(BaseModel):
    message: str

class QueryResponse(BaseModel):
    decision: str
    action: str
    severity: str
    result: str
    response_text: str
    transcript: Optional[str] = None
