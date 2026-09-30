# AI Agent Monitoring System

A backend prototype for an AI Agent Monitoring System using FastAPI, SQLite, and simulated AI Reasoning.

## Architecture

Voice Input -> AssemblyAI Voice Agent -> AI Reasoning Engine -> Decision Logic / Tool Calling -> FastAPI Backend -> SQLite

## Prerequisites

- Python 3.10+
- `pip` package manager

## Installation

1. Create a virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env` and add your AssemblyAI API key.

## Run the Application

```bash
uvicorn app.main:app --reload
```

## API Documentation

Once running, navigate to the auto-generated Swagger documentation:
[http://localhost:8000/docs](http://localhost:8000/docs)

## Testing

Example request to trigger an alert:
```bash
curl -X POST "http://localhost:8000/agent/query" \
     -H "Content-Type: application/json" \
     -d '{"message":"Suspicious activity detected in the restricted area"}'
```
