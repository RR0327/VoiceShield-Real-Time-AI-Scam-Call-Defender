import urllib.request
import json
import sys

BASE_URL = "http://127.0.0.1:8000"

def test_api():
    print("=" * 60)
    print("VoiceShield AI Defender - Automated Test Suite")
    print("=" * 60)
    
    # 1. Health check
    try:
        req = urllib.request.urlopen(f"{BASE_URL}/")
        data = json.loads(req.read().decode())
        assert data.get("status") == "online", f"Expected online, got {data}"
        print(" [PASS] 1. Backend Health Check (GET /)")
    except Exception as e:
        print(f"❌ [FAIL] Backend is not reachable at {BASE_URL}: {e}")
        return False

    # 2. Test Scam Detection: IRS / Arrest Warrant
    scam_payload = {
        "message": "This is Special Agent Reynolds from the IRS. You have an arrest warrant. Settle $4850 immediately via Apple Gift Cards or police will be dispatched."
    }
    req = urllib.request.Request(
        f"{BASE_URL}/agent/query",
        data=json.dumps(scam_payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    res = urllib.request.urlopen(req)
    res_data = json.loads(res.read().decode())
    
    assert res_data["decision"] == "scam_detected", f"Expected scam_detected, got {res_data['decision']}"
    assert res_data["severity"] in ["high", "critical"], f"Expected high/critical, got {res_data['severity']}"
    assert res_data["risk_score"] >= 60, f"Expected score >= 60, got {res_data['risk_score']}"
    print(f" [PASS] 2. IRS Scam Detection (Risk Score: {res_data['risk_score']}%, Severity: {res_data['severity']})")
    print(f"        Category: {res_data['scam_category']}")
    print(f"        Red Flags: {', '.join(res_data['red_flags'][:3])}")

    # 3. Test Scam Detection: Banking / OTP Theft
    bank_payload = {
        "message": "Chase Fraud Alert: Unauthorized wire transfer detected. Please read back your one-time verification password OTP right now to block it."
    }
    req = urllib.request.Request(
        f"{BASE_URL}/agent/query",
        data=json.dumps(bank_payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    res = urllib.request.urlopen(req)
    res_data = json.loads(res.read().decode())
    assert res_data["decision"] == "scam_detected"
    print(f" [PASS] 3. Banking/OTP Scam Detection (Risk Score: {res_data['risk_score']}%, Severity: {res_data['severity']})")

    # 4. Test Safe Routine Call
    safe_payload = {
        "message": "Hi Sarah, just calling to confirm our dentist appointment tomorrow at 10 AM. See you then!"
    }
    req = urllib.request.Request(
        f"{BASE_URL}/agent/query",
        data=json.dumps(safe_payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    res = urllib.request.urlopen(req)
    res_data = json.loads(res.read().decode())
    assert res_data["decision"] == "routine_log"
    assert res_data["risk_score"] == 0
    print(f" [PASS] 4. Safe Call Whitelist (Risk Score: {res_data['risk_score']}%, Decision: {res_data['decision']})")

    # 5. Verify Database Logging
    req = urllib.request.urlopen(f"{BASE_URL}/alerts")
    alerts = json.loads(req.read().decode())
    assert len(alerts) > 0, "No alerts recorded in database"
    print(f" [PASS] 5. Database Verification ({len(alerts)} alerts saved in SQLite database)")

    # 6. Verify System Telemetry
    req = urllib.request.urlopen(f"{BASE_URL}/stats")
    stats = json.loads(req.read().decode())
    print(f" [PASS] 6. System Stats (Total Alerts: {stats['total_alerts']}, Active Threats: {stats['active_threats']})")

    print("=" * 60)
    print(" ALL TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = test_api()
    sys.exit(0 if success else 1)
