import re
from typing import Dict, Any, List

# Define scam patterns and categories
SCAM_CATEGORIES = {
    "Government / Police Impersonation": {
        "keywords": [
            "irs", "internal revenue service", "fbi", "police department", "law enforcement",
            "border patrol", "customs", "arrest warrant", "legal action", "jail", "sheriff",
            "social security administration", "suspended social security", "federal marshal"
        ],
        "weight": 35,
        "advice": "Government agencies will NEVER call you demanding immediate payment or threatening arrest. Hang up immediately."
    },
    "Financial & Banking Fraud": {
        "keywords": [
            "bank account", "wire transfer", "western union", "routing number", "credit card number",
            "cvv", "pin number", "bitcoin atm", "crypto", "cryptocurrency", "zelle", "venmo",
            "cash app", "unauthorized transaction", "fraud department", "blocked card"
        ],
        "weight": 30,
        "advice": "Never share financial details or transfer funds on unsolicited calls. Call the phone number printed on the back of your bank card."
    },
    "Credential & OTP Theft": {
        "keywords": [
            "one-time password", "otp", "verification code", "auth code", "security code",
            "password", "temporary pin", "two-factor code", "2fa"
        ],
        "weight": 35,
        "advice": "CRITICAL: Never read back or share verification codes or passwords with anyone. Banks and services never ask for your OTP."
    },
    "Gift Card Coercion": {
        "keywords": [
            "gift card", "apple gift card", "target gift card", "google play card",
            "walmart gift card", "ebay gift card", "scratch the back", "read the 16 digits"
        ],
        "weight": 40,
        "advice": "Gift cards are strictly for gifts. Any caller asking for gift card payment is 100% a scammer."
    },
    "Tech Support & Remote Access": {
        "keywords": [
            "virus detected", "infected computer", "microsoft support", "windows defender",
            "anydesk", "teamviewer", "quickassist", "ultraviewer", "download this app",
            "hacker on your network", "compromised system", "firewall breach"
        ],
        "weight": 30,
        "advice": "Do NOT download software or grant remote access to your computer. Tech companies do not make unsolicited calls about computer viruses."
    },
    "Urgency & Threat Coercion": {
        "keywords": [
            "immediately", "urgent action required", "within 15 minutes", "right now",
            "do not hang up", "stay on the line", "arrest you", "license suspended",
            "pay or face arrest", "final notice", "strictly confidential"
        ],
        "weight": 20,
        "advice": "Scammers create false urgency to panic victims into hasty decisions. Stay calm and disconnect."
    },
    "Lottery / Prize / Refund Phishing": {
        "keywords": [
            "you won", "sweepstakes", "lottery prize", "processing fee", "inheritance",
            "amazon refund", "geek squad subscription", "overcharged", "claim your prize", "sweetheart"
        ],
        "weight": 25,
        "advice": "If you didn't enter a contest or make a purchase, you didn't win or get overcharged. Do not pay any 'release fee'."
    },
    "Family / Grandchild Emergency": {
        "keywords": [
            "grandma", "grandpa", "car accident", "in jail", "bail money", "pleading for help",
            "don't tell mom", "don't tell dad", "need money quick"
        ],
        "weight": 35,
        "advice": "Verify by calling the family member directly on their known regular phone number before taking any action."
    }
}

EMERGENCY_KEYWORDS = [
    "emergency", "help me", "police", "fire department", "intruder",
    "danger", "threat", "violence", "scared", "ambulance", "break in"
]

REPORT_KEYWORDS = ["report", "summary", "audit", "statistics", "overview", "log list"]

def analyze_request(message: str) -> Dict[str, Any]:
    """
    Analyzes input text for scam indicators, urgency coercion, emergency signals,
    and returns rich classification metadata, risk score, detected red flags, and advice.
    """
    message_clean = message.lower().strip()
    
    # 1. Check for genuine local physical emergency
    is_emergency = any(k in message_clean for k in EMERGENCY_KEYWORDS) and not any(k in message_clean for k in ["irs", "gift card", "refund", "bitcoin", "otp"])
    if is_emergency:
        return {
            "intent": "emergency_alert",
            "severity": "critical",
            "risk_score": 95,
            "scam_category": "Physical Emergency Signal",
            "red_flags": ["Urgent distress keywords detected in audio"],
            "tool": "send_alert",
            "recommended_action": "🚨 Emergency distress words detected. If you or the speaker are in physical danger, contact emergency services (911) immediately.",
            "reason": "Emergency situation detected"
        }

    # 2. Check for scam vectors and tally risk score
    detected_categories = []
    matched_flags = []
    total_score = 0
    
    for category, config in SCAM_CATEGORIES.items():
        found_in_category = []
        for kw in config["keywords"]:
            pattern = r'\b' + re.escape(kw) + r'\b'
            if re.search(pattern, message_clean) or kw in message_clean:
                found_in_category.append(kw)
        
        if found_in_category:
            detected_categories.append(category)
            matched_flags.extend([f"{category}: '{kw}'" for kw in found_in_category[:2]])
            total_score += config["weight"]

    # Cap score at 100
    risk_score = min(total_score, 100)

    # 3. Handle high risk scam detection
    if risk_score >= 30:
        primary_category = detected_categories[0] if detected_categories else "Suspected Fraudulent Call"
        primary_advice = SCAM_CATEGORIES.get(primary_category, {}).get("advice", "Hang up immediately and do not provide private information.")
        
        severity = "critical" if risk_score >= 70 else ("high" if risk_score >= 45 else "medium")
        
        return {
            "intent": "scam_detected",
            "severity": severity,
            "risk_score": risk_score,
            "scam_category": primary_category,
            "red_flags": matched_flags[:5],
            "tool": "send_alert",
            "recommended_action": primary_advice,
            "reason": f"High risk call detected ({primary_category}) with {len(matched_flags)} red flags."
        }

    # 4. Reporting inquiry
    if any(k in message_clean for k in REPORT_KEYWORDS):
        return {
            "intent": "report",
            "severity": "low",
            "risk_score": 5,
            "scam_category": "System Reporting Inquiry",
            "red_flags": [],
            "tool": "generate_report",
            "recommended_action": "Generating incident and activity summary.",
            "reason": "User requested monitoring report"
        }

    # 5. Routine safe conversation
    return {
        "intent": "routine_log",
        "severity": "low",
        "risk_score": 0,
        "scam_category": "Normal Conversation",
        "red_flags": [],
        "tool": "log_event",
        "recommended_action": "Call appears safe. VoiceShield is continuously monitoring.",
        "reason": "No scam patterns detected in voice transcript."
    }
