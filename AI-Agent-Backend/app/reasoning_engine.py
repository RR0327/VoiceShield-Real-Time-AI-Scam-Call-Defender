def analyze_request(message: str) -> dict:
    """
    Understand user intent, determine severity, decide required action, and select tools.
    (Upgraded Hackathon MVP Version)
    """
    message_lower = message.lower()
    
    # 1. SCAM DETECTION (Romance, Tech Support, IRS, etc.)
    scam_keywords = ["sweetheart", "gift card", "bank account", "social security", "virus", "refund", "wire transfer", "western union", "password", "crypto"]
    if any(keyword in message_lower for keyword in scam_keywords):
        return {
            "intent": "scam_detected",
            "severity": "high",
            "tool": "send_alert",
            "reason": "Potential scam language detected (Romance/Financial/Tech Support)"
        }
        
    # 2. EMERGENCY DETECTION
    emergency_keywords = ["emergency", "help me", "police", "suspicious", "danger", "threat", "scared"]
    if any(keyword in message_lower for keyword in emergency_keywords):
        return {
            "intent": "emergency_alert",
            "severity": "high",
            "tool": "send_alert",
            "reason": "Emergency situation detected"
        }
        
    # 3. REPORTING
    if "report" in message_lower or "summary" in message_lower:
        return {
            "intent": "report",
            "severity": "medium",
            "tool": "generate_report",
            "reason": "User requested a report"
        }
        
    # 4. DEFAULT LOGGING
    return {
        "intent": "routine_log",
        "severity": "low",
        "tool": "log_event",
        "reason": "Routine conversational event logging"
    }
