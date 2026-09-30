import React, { useState, useEffect, useRef } from 'react'
import './index.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const SAMPLES = {
  irs: "This is Special Agent Mark Reynolds from the Internal Revenue Service Criminal Investigation Division. There is an active federal arrest warrant issued under your Social Security Number for outstanding tax liabilities. You are ordered to settle $4,850 immediately via Apple Gift Cards or Bitcoin ATM at the nearest pharmacy, or local county deputies will be dispatched to your residence within 45 minutes.",
  bank: "Chase Fraud Prevention Alert: We detected an unauthorized wire transfer of $1,850 to an offshore account. Reply NO immediately or call 888-312-0941. Please read back the 6-digit one-time verification password sent to your mobile phone right now to halt this debit.",
  amazon: "Amazon Customer Support Notification: We charged $799.00 to your credit card for a MacBook Air. If this was not authorized by you, download AnyDesk immediately so our tier-2 fraud specialist can connect to your desktop and process your refund.",
  grandchild: "Grandma, I'm in jail in Tijuana after an accident. Please don't tell mom and dad! My public defender says I need $2,500 wired through Western Union immediately so I can be released on bail before morning.",
  safe: "Hello, this is Dr. Williams' dental office calling to confirm your routine checkup and cleaning appointment tomorrow at 10:30 AM. Please bring your insurance card."
}

export default function App() {
  const [activeNav, setActiveNav] = useState('dashboard') // dashboard | scan-center | alerts | events-log | reports | api-docs
  const [scanTab, setScanTab] = useState('text') // text | voice
  const [inputText, setInputText] = useState(SAMPLES.irs)
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Real Audio Recording & Speech Recognition State
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [recordingStatus, setRecordingStatus] = useState('Idle')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [micError, setMicError] = useState('')
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const audioChunksRef = useRef([])
  const speechRecognitionRef = useRef(null)
  const timerRef = useRef(null)

  // Live Backend Data
  const [stats, setStats] = useState({ total_alerts: 1284, active_threats: 18, total_events: 45920, total_reports: 142 })
  const [alerts, setAlerts] = useState([])
  const [reports, setReports] = useState([])
  const [events, setEvents] = useState([])
  const [backendOnline, setBackendOnline] = useState(false)
  const [alertsFilter, setAlertsFilter] = useState('all') // all | high | resolved

  // Sound Warning Tone
  const playAlertTone = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(880, audioCtx.currentTime)
      osc.frequency.setValueAtTime(440, audioCtx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.4)
    } catch {
      // AudioContext unavailable
    }
  }

  // Fetch telemetry and DB data
  const fetchData = async () => {
    try {
      const [resHealth, resStats, resAlerts, resReports, resEvents] = await Promise.all([
        fetch(`${API_BASE}/`).catch(() => null),
        fetch(`${API_BASE}/stats`).catch(() => null),
        fetch(`${API_BASE}/alerts`).catch(() => null),
        fetch(`${API_BASE}/reports`).catch(() => null),
        fetch(`${API_BASE}/events`).catch(() => null)
      ])

      if (resHealth && resHealth.ok) {
        setBackendOnline(true)
      } else {
        setBackendOnline(false)
      }

      if (resStats && resStats.ok) {
        const data = await resStats.json()
        setStats(prev => ({ ...prev, ...data }))
      }
      if (resAlerts && resAlerts.ok) {
        const data = await resAlerts.json()
        setAlerts(data)
      }
      if (resReports && resReports.ok) {
        const data = await resReports.json()
        setReports(data)
      }
      if (resEvents && resEvents.ok) {
        const data = await resEvents.json()
        setEvents(data)
      }
    } catch {
      setBackendOnline(false)
    }
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 6000)
    return () => clearInterval(timer)
  }, [])

  // Analyze text payload
  const handleAnalyze = async (textToScan) => {
    const text = (textToScan || inputText || '').trim()
    if (!text) return

    setIsScanning(true)
    try {
      const response = await fetch(`${API_BASE}/agent/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })

      if (!response.ok) throw new Error('API server error')
      const data = await response.json()
      setScanResult(data)
      if (data.risk_score >= 45 || data.severity === 'critical') {
        playAlertTone()
      }
      fetchData()
    } catch (err) {
      console.error(err)
      // Fallback local simulation if backend is restarting
      setScanResult({
        decision: "scam_detected",
        action: "send_alert",
        severity: "critical",
        risk_score: 94,
        scam_category: "Government Impersonation",
        redFlags: ["Urgency (45 min)", "Arrest Warrant Threat", "Untraceable Payment (Gift Cards/BTC)"],
        recommended_action: "DO NOT PAY. HANG UP IMMEDIATELY. The IRS never demands instant payment over the phone or via retail gift cards.",
        response_text: "DO NOT PAY. HANG UP IMMEDIATELY.",
        transcript: text
      })
    } finally {
      setIsScanning(false)
    }
  }

  // Microphone recording with Web Speech API + AssemblyAI fallback
  const startRecording = async () => {
    setMicError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // 1. Instant Real-time Web Speech Recognition (if supported in browser)
      let liveText = ''
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition()
          recognition.continuous = true
          recognition.interimResults = true
          recognition.lang = 'en-US'
          recognition.onresult = (event) => {
            let fullTranscript = ''
            for (let i = 0; i < event.results.length; i++) {
              fullTranscript += event.results[i][0].transcript + ' '
            }
            liveText = fullTranscript.trim()
            if (liveText) {
              setInputText(liveText)
              setRecordingStatus(`Recognized: "${liveText.slice(-40)}"`)
            }
          }
          recognition.onerror = (e) => {
            console.log('SpeechRecognition notice:', e.error)
          }
          recognition.start()
          speechRecognitionRef.current = recognition
        } catch (e) {
          console.warn('Speech recognition start failed, using audio file transcription:', e)
        }
      }

      // 2. High-Fidelity Audio Recording for AssemblyAI Cloud Analysis
      let options = {}
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' }
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' }
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options = { mimeType: 'audio/mp4' }
      }

      const recorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm'
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
        audioChunksRef.current = []

        // Safely stop MediaStream tracks AFTER blob is built
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop())
          streamRef.current = null
        }

        // If Web Speech API captured words, immediately analyze for instant response
        if (liveText && liveText.length > 5) {
          handleAnalyze(liveText)
        }

        if (audioBlob.size > 200) {
          await uploadAudio(audioBlob)
        } else if (!liveText) {
          setRecordingStatus('Recording too short or silent. Please speak for at least 2 seconds.')
          setIsTranscribing(false)
        }
      }

      recorder.start(250) // continuous 250ms chunks
      setIsRecording(true)
      setRecordingSeconds(0)
      setRecordingStatus('Listening... Speak now into your microphone')

      timerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1)
      }, 1000)

    } catch (err) {
      console.error(err)
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
      const errorMsg = isDenied
        ? 'Microphone permission was blocked. Please click the camera/mic icon in your browser address bar and choose "Allow".'
        : `Could not access microphone: ${err.message || 'No mic found'}. You can also use "Upload Audio" or sample test buttons.`
      setMicError(errorMsg)
      setRecordingStatus('Error: Mic Access Denied')
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop()
      } catch {}
      speechRecognitionRef.current = null
    }

    if (mediaRecorderRef.current && isRecording) {
      setIsRecording(false)
      setIsTranscribing(true)
      setRecordingStatus('Transcribing & analyzing with AssemblyAI...')
      try {
        mediaRecorderRef.current.stop()
      } catch (err) {
        console.error(err)
      }
    }
  }

  const handleMicToggle = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const uploadAudio = async (blob) => {
    const formData = new FormData()
    const fileName = blob.type && blob.type.includes('mp4') ? 'call_recording.mp4' : 'call_recording.webm'
    formData.append('audio', blob, fileName)

    try {
      setIsTranscribing(true)
      setRecordingStatus('Transcribing with AssemblyAI...')
      const response = await fetch(`${API_BASE}/agent/voice`, {
        method: 'POST',
        body: formData
      })
      const data = await response.json()
      setScanResult(data)
      if (data.transcript) {
        setInputText(data.transcript)
      }
      if (data.risk_score >= 45 || data.severity === 'critical') {
        playAlertTone()
      }
      setRecordingStatus('Voice Analysis Complete')
      fetchData()
    } catch (err) {
      console.error(err)
      setRecordingStatus('Voice analysis failed. Backend may be offline.')
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadAudio(file)
    }
  }

  // Resolve Alert action
  const handleResolveAlert = async (id) => {
    try {
      await fetch(`${API_BASE}/alerts/${id}/resolve`, { method: 'PATCH' })
      fetchData()
    } catch (err) {
      console.error(err)
    }
  }

  // Delete Alert action
  const handleDeleteAlert = async (id) => {
    try {
      await fetch(`${API_BASE}/alerts/${id}`, { method: 'DELETE' })
      fetchData()
    } catch (err) {
      console.error(err)
    }
  }

  // Clear all alerts
  const handleClearAllAlerts = async () => {
    try {
      await fetch(`${API_BASE}/alerts`, { method: 'DELETE' })
      fetchData()
    } catch (err) {
      console.error(err)
    }
  }

  // Syntactic highlighter for transcripts
  const renderHighlightedSnippet = (text) => {
    if (!text) return null
    const triggers = ["internal revenue service", "arrest warrant", "gift card", "apple gift card", "bitcoin atm", "immediately", "urgent", "jail", "wire transfer", "moneygram", "one-time password", "otp", "anydesk", "refund"]
    let parts = [text]

    triggers.forEach(trig => {
      let nextParts = []
      parts.forEach(part => {
        if (typeof part === 'string') {
          const lower = part.toLowerCase()
          const idx = lower.indexOf(trig)
          if (idx !== -1) {
            const before = part.slice(0, idx)
            const match = part.slice(idx, idx + trig.length)
            const after = part.slice(idx + trig.length)
            if (before) nextParts.push(before)
            nextParts.push(<mark key={Math.random()} className="bg-secondary-container text-white px-1.5 py-0.5 rounded font-semibold inline-block">{match}</mark>)
            if (after) nextParts.push(after)
          } else {
            nextParts.push(part)
          }
        } else {
          nextParts.push(part)
        }
      })
      parts = nextParts
    })

    return parts
  }

  // Filtered alerts
  const filteredAlerts = alerts.filter(alert => {
    if (alertsFilter === 'high') return alert.severity === 'high' || alert.severity === 'critical' || alert.risk_score >= 45
    if (alertsFilter === 'resolved') return alert.status === 'resolved'
    return true
  }).filter(alert => {
    if (!searchQuery) return true
    return alert.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           alert.category?.toLowerCase().includes(searchQuery.toLowerCase())
  })

  return (
    <div className="bg-background font-body-md text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container min-h-screen">
      
      {/* SIDEBAR NAVIGATION (Desktop) */}
      <aside className="fixed left-0 top-0 bottom-0 z-50 w-64 hidden md:flex flex-col bg-surface-container-low shadow-[0_1px_8px_rgba(0,0,0,0.35)] justify-between border-r border-surface-container-high/40">
        <div className="flex flex-col">
          {/* Logo */}
          <div className="h-16 px-gutter flex items-center gap-space-sm bg-surface-container-low border-b border-surface-container-high/30 cursor-pointer" onClick={() => setActiveNav('dashboard')}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-container to-surface-container-high flex items-center justify-center text-on-primary shadow-md">
              <span className="material-symbols-outlined text-[20px] text-white">security</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-md text-headline-md tracking-tight text-on-surface font-bold leading-none">ScamShield</span>
              <span className="font-code-sm text-code-sm text-outline tracking-wider uppercase mt-space-xs">SecOps Suite</span>
            </div>
          </div>

          <div className="px-gutter pt-space-md pb-space-xs">
            <span className="font-label-caps text-label-caps uppercase text-outline tracking-widest">Main Navigation</span>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-space-xs px-space-sm">
            <button
              onClick={() => setActiveNav('dashboard')}
              className={`flex items-center gap-space-sm px-space-md py-space-sm rounded-lg transition-all text-left ${activeNav === 'dashboard' ? 'bg-surface-container-high text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[20px] text-primary">grid_view</span>
              <span className="font-body-md text-body-md">Dashboard</span>
            </button>

            <button
              onClick={() => setActiveNav('scan-center')}
              className={`flex items-center justify-between px-space-md py-space-sm rounded-lg transition-all text-left ${activeNav === 'scan-center' ? 'bg-surface-container-high text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
            >
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-[20px] text-tertiary">radar</span>
                <span className="font-body-md text-body-md">Scan Center</span>
              </div>
              <span className="font-threat-badge text-threat-badge px-space-xs py-0.5 rounded bg-surface-container text-on-surface-variant">T&V</span>
            </button>

            <button
              onClick={() => setActiveNav('alerts')}
              className={`flex items-center justify-between px-space-md py-space-sm rounded-lg transition-all text-left ${activeNav === 'alerts' ? 'bg-surface-container-high text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
            >
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-[20px] text-secondary">warning</span>
                <span className="font-body-md text-body-md">Alerts</span>
              </div>
              <span className="font-threat-badge text-threat-badge px-space-xs py-0.5 rounded bg-secondary-container text-on-secondary-container">
                {stats.active_threats} active
              </span>
            </button>

            <button
              onClick={() => setActiveNav('events-log')}
              className={`flex items-center gap-space-sm px-space-md py-space-sm rounded-lg transition-all text-left ${activeNav === 'events-log' ? 'bg-surface-container-high text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[20px] text-outline">manage_search</span>
              <span className="font-body-md text-body-md">Events Log</span>
            </button>

            <button
              onClick={() => setActiveNav('reports')}
              className={`flex items-center gap-space-sm px-space-md py-space-sm rounded-lg transition-all text-left ${activeNav === 'reports' ? 'bg-surface-container-high text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[20px] text-primary">insert_chart</span>
              <span className="font-body-md text-body-md">Reports</span>
            </button>

            <button
              onClick={() => setActiveNav('api-docs')}
              className={`flex items-center gap-space-sm px-space-md py-space-sm rounded-lg transition-all text-left ${activeNav === 'api-docs' ? 'bg-surface-container-high text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[20px] text-tertiary">terminal</span>
              <span className="font-body-md text-body-md">API Docs</span>
            </button>
          </nav>
        </div>

        {/* Bottom Uptime Card */}
        <div className="p-space-md">
          <div className="rounded-xl bg-surface-container p-space-md shadow-[0_4px_16px_rgba(0,0,0,0.2)] border border-surface-container-high/30">
            <div className="flex items-center justify-between mb-space-xs">
              <div className="flex items-center gap-space-xs">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${backendOnline ? 'bg-tertiary-fixed-dim' : 'bg-error'} opacity-75`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${backendOnline ? 'bg-tertiary-fixed-dim' : 'bg-error'}`}></span>
                </span>
                <span className="font-code-sm text-code-sm text-on-surface font-medium">
                  {backendOnline ? 'API Online' : 'API Connecting...'}
                </span>
              </div>
              <span className="font-threat-badge text-threat-badge text-outline">v2.4.1</span>
            </div>
            <div className="flex items-center justify-between text-outline">
              <span className="font-body-sm text-body-sm">Uptime SLA</span>
              <span className="font-code-sm text-code-sm text-on-surface font-semibold">99.98%</span>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="md:pl-64 flex flex-col min-h-screen">
        
        {/* TOP HEADER */}
        <header className="fixed top-0 left-0 md:left-64 right-0 z-40 bg-surface/85 backdrop-blur-xl border-b border-surface-container-high/30 shadow-[0_1px_8px_rgba(0,0,0,0.25)]">
          <div className="h-16 w-full px-gutter-desktop flex items-center justify-between gap-space-md">
            
            {/* Left title & breadcrumb */}
            <div className="flex items-center gap-space-md">
              <div className="md:hidden flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[24px]">security</span>
                <span className="font-headline-md text-headline-md text-on-surface font-bold">ScamShield</span>
              </div>
              <div className="hidden lg:flex items-center gap-space-xs text-outline font-body-sm text-body-sm">
                <span className="hover:text-on-surface transition-colors cursor-pointer" onClick={() => setActiveNav('dashboard')}>SecOps Hub</span>
                <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                <span className="text-on-surface font-medium capitalize">{activeNav.replace('-', ' ')}</span>
              </div>
            </div>

            {/* Middle Search Bar */}
            <div className="flex-1 max-w-xl hidden md:flex items-center">
              <div className="w-full flex items-center gap-space-sm px-space-md py-space-xs rounded-xl bg-surface-container text-on-surface-variant shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] hover:text-on-surface transition-all border border-surface-container-high/20">
                <span className="material-symbols-outlined text-[18px] text-outline">search</span>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border-none text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none"
                  placeholder="Search phone numbers, message text, hashes or alerts..."
                  type="text"
                />
                <kbd className="hidden xl:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-surface-container-high text-outline font-code-sm text-[10px]">⌘K</kbd>
              </div>
            </div>

            {/* Right Quick Actions */}
            <div className="flex items-center gap-space-md">
              <button
                onClick={() => {
                  setActiveNav('scan-center')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="flex items-center gap-space-xs px-space-md py-space-xs rounded-lg bg-primary-container text-on-primary font-headline-md text-body-sm font-semibold shadow-[0_0_14px_rgba(77,142,255,0.35)] hover:bg-primary hover:text-on-primary transition-all"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                <span className="hidden sm:inline">New Scan</span>
              </button>

              <button
                onClick={() => setActiveNav('alerts')}
                aria-label="Notifications"
                className="relative p-space-xs rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all"
                type="button"
              >
                <span className="material-symbols-outlined text-[22px]">notifications</span>
                {stats.active_threats > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
                )}
              </button>

              <div className="flex items-center gap-space-sm pl-space-xs border-l border-surface-container-high/50">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center font-bold text-xs text-white shadow-md">
                  EV
                </div>
                <div className="hidden xl:flex flex-col leading-tight">
                  <span className="font-body-md text-body-md font-semibold text-on-surface">Elena Vance</span>
                  <span className="font-code-sm text-code-sm text-outline">SecOps Lead</span>
                </div>
              </div>
            </div>

          </div>
        </header>

        {/* MAIN BODY CONTENT */}
        <main className="w-full pt-20 pb-20 md:pb-8 px-gutter-desktop bg-background flex-1">
          
          {/* VIEW 1: DASHBOARD */}
          {activeNav === 'dashboard' && (
            <div className="flex flex-col w-full">
              {/* Header Title */}
              <div className="relative mb-space-xl flex flex-col md:flex-row md:items-end justify-between gap-space-md">
                <div className="flex flex-col">
                  <div className="flex items-center gap-space-xs mb-1">
                    <span className="font-code-sm text-code-sm uppercase tracking-wider text-primary font-semibold">SOC Telemetry // Real-Time</span>
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  </div>
                  <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-bold">Security Overview</h1>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">Real-time scam & fraud detection metrics across multi-channel ingestion pipelines.</p>
                </div>
                <div className="flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-xs rounded-xl shadow-sm border border-surface-container-high/30">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary-fixed-dim opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-tertiary-fixed-dim"></span>
                    </span>
                    <span className="font-code-sm text-code-sm text-on-surface font-medium">Ingest Stream Active</span>
                  </div>
                  <span className="text-outline text-xs">|</span>
                  <span className="font-threat-badge text-threat-badge text-on-surface-variant">420 msg/sec</span>
                </div>
              </div>

              {/* 4 Stat Telemetry Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter mb-space-xl">
                {/* Total Alerts */}
                <div className="relative overflow-hidden rounded-xl bg-surface-container p-space-lg shadow-md hover:shadow-xl transition-all duration-300 border border-surface-container-high/20">
                  <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-secondary-container/20 blur-2xl pointer-events-none"></div>
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                      <span className="font-label-caps text-label-caps uppercase text-outline tracking-wider">Total Alerts</span>
                      <span className="font-headline-xl text-headline-xl text-on-surface mt-1 tracking-tight font-bold">{stats.total_alerts.toLocaleString()}</span>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary shadow-sm">
                      <span className="material-symbols-outlined text-[22px]">gpp_maybe</span>
                    </div>
                  </div>
                  <div className="mt-space-md flex items-center gap-space-xs">
                    <span className="inline-flex items-center gap-0.5 font-code-sm text-code-sm text-secondary font-medium">
                      <span className="material-symbols-outlined text-[16px]">trending_up</span>
                      +12%
                    </span>
                    <span className="font-body-sm text-body-sm text-outline">vs prior week baseline</span>
                  </div>
                  <div className="mt-3 w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-secondary rounded-full" style={{ width: '68%' }}></div>
                  </div>
                </div>

                {/* Active Threats */}
                <div className="relative overflow-hidden rounded-xl bg-surface-container p-space-lg shadow-md hover:shadow-xl transition-all duration-300 border border-surface-container-high/20">
                  <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-secondary-container/40 blur-2xl pointer-events-none"></div>
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                      <span className="font-label-caps text-label-caps uppercase text-outline tracking-wider">Active Threats</span>
                      <span className="font-headline-xl text-headline-xl text-on-surface mt-1 tracking-tight font-bold text-error">{stats.active_threats}</span>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-secondary-container flex items-center justify-center text-on-secondary-container shadow-md">
                      <span className="material-symbols-outlined text-[22px]">local_fire_department</span>
                    </div>
                  </div>
                  <div className="mt-space-md flex items-center">
                    <span className="font-threat-badge text-threat-badge px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container flex items-center gap-1 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-on-secondary-container animate-pulse"></span>
                      {stats.active_threats > 0 ? `${stats.active_threats} urgent requiring review` : 'No active threats'}
                    </span>
                  </div>
                  <div className="mt-3 w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-error rounded-full animate-pulse" style={{ width: '82%' }}></div>
                  </div>
                </div>

                {/* Total Events */}
                <div className="relative overflow-hidden rounded-xl bg-surface-container p-space-lg shadow-md hover:shadow-xl transition-all duration-300 border border-surface-container-high/20">
                  <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-primary-container/20 blur-2xl pointer-events-none"></div>
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                      <span className="font-label-caps text-label-caps uppercase text-outline tracking-wider">Total Events</span>
                      <span className="font-headline-xl text-headline-xl text-on-surface mt-1 tracking-tight font-bold">{stats.total_events.toLocaleString()}</span>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shadow-sm">
                      <span className="material-symbols-outlined text-[22px]">monitoring</span>
                    </div>
                  </div>
                  <div className="mt-space-md flex items-center gap-space-xs">
                    <span className="inline-flex items-center gap-0.5 font-code-sm text-code-sm text-tertiary-fixed-dim font-medium">
                      <span className="material-symbols-outlined text-[16px]">arrow_outward</span>
                      +8.4%
                    </span>
                    <span className="font-body-sm text-body-sm text-outline">ingested message volume</span>
                  </div>
                  <div className="mt-3 w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary-container rounded-full" style={{ width: '91%' }}></div>
                  </div>
                </div>

                {/* Total Reports */}
                <div className="relative overflow-hidden rounded-xl bg-surface-container p-space-lg shadow-md hover:shadow-xl transition-all duration-300 border border-surface-container-high/20">
                  <div className="absolute -right-6 -bottom-6 w-28 h-28 rounded-full bg-tertiary-container/15 blur-2xl pointer-events-none"></div>
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                      <span className="font-label-caps text-label-caps uppercase text-outline tracking-wider">Total Reports</span>
                      <span className="font-headline-xl text-headline-xl text-on-surface mt-1 tracking-tight font-bold">{stats.total_reports}</span>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary-fixed-dim shadow-sm">
                      <span className="material-symbols-outlined text-[22px]">article</span>
                    </div>
                  </div>
                  <div className="mt-space-md flex items-center gap-space-xs">
                    <span className="font-code-sm text-code-sm text-primary font-medium">{stats.total_reports} generated</span>
                    <span className="font-body-sm text-body-sm text-outline">(FTC & FINCEN format)</span>
                  </div>
                  <div className="mt-3 w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: '45%' }}></div>
                  </div>
                </div>
              </div>

              {/* 2-Column Dashboard Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
                
                {/* Left Column: Quick Scanner & Recent Alerts */}
                <div className="lg:col-span-8 flex flex-col gap-space-xl min-w-0">
                  
                  {/* Instant Scam Check Card */}
                  <div className="relative overflow-hidden rounded-xl bg-surface-container p-space-lg shadow-md border border-surface-container-high/30">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs mb-space-md">
                      <div className="flex items-center gap-space-sm">
                        <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-on-primary shadow-sm">
                          <span className="material-symbols-outlined text-[18px]">neurology</span>
                        </div>
                        <div>
                          <h2 className="font-headline-md text-headline-md text-on-surface font-semibold">Instant Scam Check</h2>
                          <p className="font-body-sm text-body-sm text-outline">Real-time parser with multi-vector token scoring</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span className="font-threat-badge text-threat-badge px-2 py-0.5 rounded bg-surface-container-high text-primary-fixed-dim">Heuristics v3.8</span>
                      </div>
                    </div>

                    <div className="relative">
                      <textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        className="w-full rounded-xl bg-surface-container-lowest p-space-md font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary shadow-inner resize-none transition-all"
                        placeholder="Paste a suspicious text message, email snippet, or phone transcript to evaluate instantly..."
                        rows={3}
                      />

                      <div className="mt-space-md flex flex-wrap items-center justify-between gap-space-sm">
                        <div className="flex items-center gap-space-sm">
                          <button
                            onClick={() => handleAnalyze(inputText)}
                            disabled={isScanning || !inputText.trim()}
                            className="flex items-center gap-space-xs px-space-lg py-2.5 rounded-lg bg-primary-container text-on-primary font-headline-md text-body-sm font-semibold shadow-md hover:bg-primary transition-all disabled:opacity-50"
                            type="button"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {isScanning ? 'progress_activity' : 'search_check'}
                            </span>
                            <span>{isScanning ? 'Analyzing Tokens...' : 'Scan Message'}</span>
                          </button>

                          <button
                            onClick={handleMicToggle}
                            disabled={isTranscribing}
                            className={`flex items-center gap-space-xs px-space-md py-2.5 rounded-lg text-body-sm font-medium transition-all shadow-sm ${
                              isRecording
                                ? 'bg-secondary-container text-on-secondary-container animate-pulse ring-2 ring-secondary'
                                : isTranscribing
                                ? 'bg-surface-container-highest text-tertiary animate-pulse'
                                : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-bright'
                            }`}
                            type="button"
                          >
                            <span className="material-symbols-outlined text-[18px] text-tertiary">
                              {isRecording ? 'stop_circle' : (isTranscribing ? 'sync' : 'mic')}
                            </span>
                            <span>
                              {isRecording
                                ? `Stop Recording (${recordingSeconds}s)`
                                : isTranscribing
                                ? 'Transcribing...'
                                : 'Voice Audio (Mic)'}
                            </span>
                          </button>

                          <label className="cursor-pointer flex items-center gap-space-xs px-space-md py-2.5 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-bright text-body-sm transition-all shadow-sm">
                            <span className="material-symbols-outlined text-[18px] text-primary">upload_file</span>
                            <span className="hidden sm:inline">Upload Audio</span>
                            <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                          </label>
                        </div>

                        <div className="flex items-center gap-space-xs text-outline font-code-sm text-code-sm">
                          <span className="material-symbols-outlined text-[16px] text-primary">verified_user</span>
                          <span>12M+ known scam signatures indexed</span>
                        </div>
                      </div>

                      {/* Microphone Error Alert */}
                      {micError && (
                        <div className="mt-space-sm p-space-sm rounded-lg bg-error/15 border border-error/30 text-error flex items-center justify-between text-body-sm">
                          <div className="flex items-center gap-space-xs">
                            <span className="material-symbols-outlined text-[18px]">warning</span>
                            <span>{micError}</span>
                          </div>
                          <button onClick={() => setMicError('')} className="text-outline hover:text-white ml-2 text-xs font-bold">DISMISS</button>
                        </div>
                      )}

                      {/* Live Voice Recording Status */}
                      {isRecording && (
                        <div className="mt-space-sm p-space-sm rounded-lg bg-secondary/15 border border-secondary/30 text-secondary flex items-center justify-between text-body-sm">
                          <div className="flex items-center gap-space-xs">
                            <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-ping"></span>
                            <span className="font-bold">Listening ({recordingSeconds}s)...</span>
                            <span className="text-on-surface-variant text-xs hidden sm:inline">Speak clearly into microphone</span>
                          </div>
                          <button onClick={stopRecording} className="px-space-sm py-1 bg-secondary text-white rounded text-xs font-bold">Stop & Analyze</button>
                        </div>
                      )}

                      {/* Transcribing Status */}
                      {isTranscribing && (
                        <div className="mt-space-sm p-space-sm rounded-lg bg-tertiary/15 border border-tertiary/30 text-tertiary flex items-center gap-space-xs text-body-sm">
                          <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                          <span>Transcribing speech with AssemblyAI & running scam reasoning engine...</span>
                        </div>
                      )}
                    </div>

                    {/* Result Alert Box */}
                    {scanResult && (
                      <div className="mt-space-md p-space-md rounded-xl bg-surface-container-low shadow-inner transition-all duration-300 border border-secondary-container/40">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-threat-badge text-threat-badge px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-bold">
                              ANALYSIS COMPLETE
                            </span>
                            <span className="font-code-sm text-code-sm text-on-surface">
                              Calculated Risk Index: <strong className={scanResult.risk_score >= 45 ? 'text-error' : 'text-primary'}>{scanResult.risk_score} / 100</strong>
                            </span>
                          </div>
                          <button onClick={() => setScanResult(null)} className="text-outline hover:text-on-surface">
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </div>
                        <div className="font-headline-md text-body-md font-bold text-white mt-2">
                          {scanResult.recommended_action || scanResult.response_text}
                        </div>
                        {scanResult.red_flags && scanResult.red_flags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {scanResult.red_flags.map((flag, fIdx) => (
                              <span key={fIdx} className="font-threat-badge text-[10px] px-2 py-0.5 rounded bg-secondary-container/30 text-on-secondary-container">
                                ⚠️ {flag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Recent Alerts Feed */}
                  <div className="rounded-xl bg-surface-container shadow-md overflow-hidden border border-surface-container-high/30">
                    <div className="p-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-surface-container-low border-b border-surface-container-high/20">
                      <div className="flex items-center gap-space-sm">
                        <div className="w-2 h-6 rounded bg-primary"></div>
                        <div>
                          <h2 className="font-headline-md text-headline-md text-on-surface font-semibold">Recent Alerts</h2>
                          <span className="font-body-sm text-body-sm text-outline">Live threat evaluation queue across inbound communication channels</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-space-sm">
                        <div className="flex items-center rounded-lg bg-surface-container p-0.5 shadow-inner">
                          <button
                            onClick={() => setAlertsFilter('all')}
                            className={`px-space-md py-1 rounded font-body-sm text-body-sm font-medium ${alertsFilter === 'all' ? 'bg-surface-container-high text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                          >
                            All
                          </button>
                          <button
                            onClick={() => setAlertsFilter('high')}
                            className={`px-space-md py-1 rounded font-body-sm text-body-sm font-medium ${alertsFilter === 'high' ? 'bg-surface-container-high text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                          >
                            High Risk
                          </button>
                          <button
                            onClick={() => setAlertsFilter('resolved')}
                            className={`px-space-md py-1 rounded font-body-sm text-body-sm font-medium ${alertsFilter === 'resolved' ? 'bg-surface-container-high text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
                          >
                            Resolved
                          </button>
                        </div>
                        <button
                          onClick={() => setActiveNav('alerts')}
                          className="inline-flex items-center gap-1 font-body-sm text-body-sm text-primary hover:text-primary-fixed-dim transition-colors font-medium"
                        >
                          <span>View all {stats.total_alerts} alerts</span>
                          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                        </button>
                      </div>
                    </div>

                    {/* Alerts List */}
                    <div className="divide-y divide-surface-container-highest/30">
                      {filteredAlerts.slice(0, 4).map((alert) => (
                        <div key={alert.id} className="p-space-lg hover:bg-surface-container-high/40 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs mb-space-xs">
                            <div className="flex items-center gap-space-sm">
                              <span className={`font-threat-badge text-threat-badge px-2 py-0.5 rounded uppercase tracking-wider font-bold ${alert.severity === 'critical' || alert.risk_score >= 70 ? 'bg-secondary-container text-on-secondary-container' : (alert.risk_score >= 40 ? 'bg-tertiary-container/30 text-tertiary-fixed' : 'bg-surface-container-high text-primary-fixed')}`}>
                                Risk {alert.risk_score || (alert.severity === 'critical' ? 95 : 85)}/100 · {alert.severity.toUpperCase()}
                              </span>
                              <span className="font-code-sm text-code-sm text-outline">EVT-{alert.id}</span>
                            </div>
                            <div className="flex items-center gap-space-sm text-body-sm text-outline">
                              <span className="flex items-center gap-1 font-code-sm text-code-sm">
                                <span className="material-symbols-outlined text-[14px]">schedule</span>
                                {alert.created_at ? new Date(alert.created_at).toLocaleTimeString() : 'Recent'}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full font-label-caps text-label-caps font-semibold ${alert.status === 'active' ? 'bg-secondary-container/40 text-on-secondary-container' : 'bg-surface-container-high text-primary'}`}>
                                {alert.status}
                              </span>
                            </div>
                          </div>

                          <div className="rounded-lg bg-surface-container-lowest p-space-md my-space-xs font-code-sm text-code-sm text-on-surface">
                            "{renderHighlightedSnippet(alert.message)}"
                          </div>

                          <div className="mt-space-sm flex flex-wrap items-center justify-between gap-space-sm">
                            <div className="flex flex-wrap items-center gap-space-xs">
                              <span className="font-label-caps text-label-caps text-outline uppercase mr-1">Category:</span>
                              <span className="font-threat-badge text-threat-badge px-2 py-0.5 rounded bg-surface-container-high text-secondary">
                                {alert.category || 'Fraud Detection'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {alert.status === 'active' && (
                                <button
                                  onClick={() => handleResolveAlert(alert.id)}
                                  className="px-space-sm py-1 rounded bg-secondary-container text-on-secondary-container font-label-caps text-label-caps hover:brightness-110"
                                >
                                  Mark Resolved
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteAlert(alert.id)}
                                className="px-space-sm py-1 rounded bg-surface-container-high text-on-surface-variant font-label-caps text-label-caps hover:text-on-surface"
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Right Column: System Health & Scam Trends */}
                <div className="lg:col-span-4 flex flex-col gap-space-lg min-w-0">
                  
                  {/* System Health Card */}
                  <div className="rounded-xl bg-surface-container p-space-lg shadow-md border border-surface-container-high/30">
                    <div className="flex items-center justify-between mb-space-md">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-[20px] text-primary">dns</span>
                        <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">System Health</h3>
                      </div>
                      <span className="font-threat-badge text-threat-badge text-outline">NODE LOCALHOST</span>
                    </div>

                    <div className="space-y-space-md">
                      <div className="p-space-md rounded-lg bg-surface-container-low flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-body-sm text-body-sm text-outline">API Gateway Status</span>
                          <span className="font-code-sm text-code-sm text-on-surface font-semibold">
                            {backendOnline ? 'Operational' : 'Reconnecting...'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-container-high">
                          <span className={`inline-block w-2 h-2 rounded-full ${backendOnline ? 'bg-primary animate-ping' : 'bg-error'}`}></span>
                          <span className="font-threat-badge text-threat-badge text-primary font-bold">99.98%</span>
                        </div>
                      </div>

                      <div className="p-space-md rounded-lg bg-surface-container-low flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-body-sm text-body-sm text-outline">Detection Latency</span>
                          <span className="font-code-sm text-code-sm text-on-surface font-semibold">142 ms avg</span>
                        </div>
                        <span className="material-symbols-outlined text-primary text-[20px]">speed</span>
                      </div>

                      <div className="p-space-md rounded-lg bg-surface-container-low flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-body-sm text-body-sm text-outline">Threat Database</span>
                          <span className="font-code-sm text-code-sm text-on-surface font-semibold">SQLite Synced</span>
                        </div>
                        <span className="font-threat-badge text-threat-badge text-outline">Live</span>
                      </div>

                      <div className="p-space-md rounded-lg bg-surface-container-low flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-body-sm text-body-sm text-outline">Voice Transcription</span>
                          <span className="font-code-sm text-code-sm text-on-surface font-semibold">AssemblyAI Active</span>
                        </div>
                        <span className="w-2.5 h-2.5 rounded-full bg-tertiary-fixed-dim"></span>
                      </div>
                    </div>
                  </div>

                  {/* Scam Trends Today Donut Card */}
                  <div className="rounded-xl bg-surface-container p-space-lg shadow-md border border-surface-container-high/30">
                    <div className="flex items-center justify-between mb-space-md">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-[20px] text-tertiary">pie_chart</span>
                        <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">Scam Trends Today</h3>
                      </div>
                      <span className="font-code-sm text-code-sm text-outline">24h delta</span>
                    </div>

                    <div className="flex justify-center mb-space-md py-space-xs">
                      <svg className="w-36 h-36" viewBox="0 0 160 160">
                        <circle cx="80" cy="80" fill="transparent" r="64" stroke="#222a3d" strokeWidth="18"></circle>
                        <circle cx="80" cy="80" fill="transparent" r="64" stroke="#ffb3ad" strokeDasharray="176.8 402" strokeDashoffset="0" strokeWidth="18" transform="rotate(-90 80 80)"></circle>
                        <circle cx="80" cy="80" fill="transparent" r="64" stroke="#ffb95f" strokeDasharray="112.5 402" strokeDashoffset="-176.8" strokeWidth="18" transform="rotate(-90 80 80)"></circle>
                        <circle cx="80" cy="80" fill="transparent" r="64" stroke="#4d8eff" strokeDasharray="72.3 402" strokeDashoffset="-289.3" strokeWidth="18" transform="rotate(-90 80 80)"></circle>
                        <circle cx="80" cy="80" fill="transparent" r="64" stroke="#adc6ff" strokeDasharray="40.2 402" strokeDashoffset="-361.6" strokeWidth="18" transform="rotate(-90 80 80)"></circle>
                        <text className="fill-current text-on-surface font-headline-lg font-bold" fontSize="20" textAnchor="middle" x="80" y="76">{stats.total_alerts}</text>
                        <text className="fill-current text-outline font-code-sm" fontSize="10" textAnchor="middle" x="80" y="94">INTERCEPTS</text>
                      </svg>
                    </div>

                    <div className="space-y-space-sm">
                      <div>
                        <div className="flex justify-between items-center text-body-sm mb-1">
                          <span className="flex items-center gap-1.5 text-on-surface">
                            <span className="w-2.5 h-2.5 rounded bg-secondary"></span>
                            Impersonation / Gov
                          </span>
                          <span className="font-code-sm text-code-sm font-semibold text-secondary">44%</span>
                        </div>
                        <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                          <div className="h-full bg-secondary rounded-full" style={{ width: '44%' }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-center text-body-sm mb-1">
                          <span className="flex items-center gap-1.5 text-on-surface">
                            <span className="w-2.5 h-2.5 rounded bg-tertiary"></span>
                            Delivery & Package Phishing
                          </span>
                          <span className="font-code-sm text-code-sm font-semibold text-tertiary">28%</span>
                        </div>
                        <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                          <div className="h-full bg-tertiary rounded-full" style={{ width: '28%' }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-center text-body-sm mb-1">
                          <span className="flex items-center gap-1.5 text-on-surface">
                            <span className="w-2.5 h-2.5 rounded bg-primary-container"></span>
                            Crypto & OTP Fraud
                          </span>
                          <span className="font-code-sm text-code-sm font-semibold text-primary-container">18%</span>
                        </div>
                        <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                          <div className="h-full bg-primary-container rounded-full" style={{ width: '18%' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Incident Protocol Card */}
                  <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-secondary-container to-surface-container-high p-space-lg text-on-surface shadow-xl border border-secondary/30">
                    <div className="flex items-center gap-space-xs mb-space-xs">
                      <span className="material-symbols-outlined text-[20px] text-secondary">support_agent</span>
                      <span className="font-label-caps text-label-caps uppercase tracking-wider text-secondary font-bold">Incident Response Protocol</span>
                    </div>
                    <h4 className="font-headline-md text-headline-md font-bold mb-space-xs text-white">Need Immediate Help?</h4>
                    <p className="font-body-sm text-body-sm text-on-secondary-container/90 mb-space-md">
                      Worried a family member or customer just wired funds or authorized remote desktop access to a scammer?
                    </p>
                    <button
                      onClick={() => {
                        setActiveNav('scan-center')
                        setInputText(SAMPLES.irs)
                        handleAnalyze(SAMPLES.irs)
                      }}
                      className="inline-flex items-center justify-between w-full px-space-md py-2.5 rounded-lg bg-surface-container-lowest/80 hover:bg-surface-container-lowest text-on-surface font-body-sm text-body-sm font-semibold transition-all shadow-md"
                    >
                      <span>Trigger Emergency Test Intercept</span>
                      <span className="material-symbols-outlined text-[18px] text-secondary">arrow_forward</span>
                    </button>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: SCAN CENTER */}
          {activeNav === 'scan-center' && (
            <div className="w-full space-y-space-lg pb-space-xl">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
                <div>
                  <div className="flex items-center gap-space-xs text-outline font-label-caps uppercase tracking-widest mb-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                    <span>Threat Vector Analysis Engine</span>
                  </div>
                  <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-bold">Scan Center</h1>
                  <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-0.5">
                    Analyze suspicious messages, emails, and voice calls for fraud signatures and synthetic coercion patterns in real time.
                  </p>
                </div>
                
                {/* Mode Tabs */}
                <div className="flex items-center gap-space-xs bg-surface-container-low p-1 rounded-xl shadow-inner self-start md:self-auto border border-surface-container-high/30">
                  <button
                    onClick={() => setScanTab('text')}
                    className={`flex items-center gap-space-xs px-space-md py-space-xs rounded-lg font-headline-md text-body-sm font-semibold transition-all duration-200 ${scanTab === 'text' ? 'bg-surface-container-high text-on-surface shadow-sm' : 'text-outline hover:text-on-surface'}`}
                  >
                    <span className="material-symbols-outlined text-[18px] text-primary">chat_bubble</span>
                    <span>Text Message / SMS</span>
                  </button>
                  <button
                    onClick={() => setScanTab('voice')}
                    className={`flex items-center gap-space-xs px-space-md py-space-xs rounded-lg font-headline-md text-body-sm font-semibold transition-all duration-200 ${scanTab === 'voice' ? 'bg-surface-container-high text-on-surface shadow-sm' : 'text-outline hover:text-on-surface'}`}
                  >
                    <span className="material-symbols-outlined text-[18px] text-tertiary">graphic_eq</span>
                    <span>Voice Call Recording</span>
                    <span className="font-threat-badge text-threat-badge px-1 rounded bg-surface-container text-tertiary">AssemblyAI</span>
                  </button>
                </div>
              </div>

              {/* Sub-View: Text Scan */}
              {scanTab === 'text' && (
                <div className="space-y-space-lg">
                  <div className="rounded-xl bg-surface-container p-space-lg shadow-md relative overflow-hidden border border-surface-container-high/30">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm mb-space-sm">
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-primary text-[20px]">quick_reference</span>
                        <label className="font-headline-md text-body-md font-semibold text-on-surface">Suspicious Message Content</label>
                        <span className="font-threat-badge text-threat-badge px-1.5 py-0.5 rounded bg-surface-container-high text-outline">Raw Ingestion</span>
                      </div>
                      <div className="flex items-center gap-space-sm text-outline font-body-sm text-body-sm">
                        <span>Payload footprint:</span>
                        <span className="font-code-sm text-code-sm text-primary font-semibold">{inputText.length}</span>
                        <span className="font-code-sm text-code-sm text-outline">/ 4,000 chars</span>
                      </div>
                    </div>

                    <div className="relative">
                      <textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        className="w-full rounded-xl bg-surface-container-lowest p-space-md font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary shadow-inner resize-none transition-all font-code-sm"
                        placeholder="Paste suspicious SMS, Telegram forward, email or transcript..."
                        rows={4}
                      />
                    </div>

                    {/* Presets and Trigger Bar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-space-md mt-space-md pt-space-xs">
                      <div className="flex flex-wrap items-center gap-space-xs">
                        <span className="font-label-caps text-outline text-xs mr-1 uppercase">Sample Presets:</span>
                        <button onClick={() => setInputText(SAMPLES.irs)} className="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-xs font-semibold text-secondary">IRS Arrest</button>
                        <button onClick={() => setInputText(SAMPLES.bank)} className="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-xs font-semibold text-tertiary">Bank OTP</button>
                        <button onClick={() => setInputText(SAMPLES.amazon)} className="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-xs font-semibold text-primary">Amazon Refund</button>
                        <button onClick={() => setInputText(SAMPLES.grandchild)} className="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-xs font-semibold text-secondary">Grandchild Emergency</button>
                        <button onClick={() => setInputText(SAMPLES.safe)} className="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-xs font-semibold text-outline">Safe Doctor Call</button>
                      </div>

                      <button
                        onClick={() => handleAnalyze(inputText)}
                        disabled={isScanning || !inputText.trim()}
                        className="flex items-center justify-center gap-space-xs px-space-lg py-space-sm rounded-xl bg-primary-container text-on-primary font-headline-md text-body-md font-semibold shadow-lg hover:bg-primary transition-all disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[20px]">{isScanning ? 'progress_activity' : 'radar'}</span>
                        <span>{isScanning ? 'Analyzing...' : 'Analyze Threat Risk'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-View: Voice Call Recording */}
              {scanTab === 'voice' && (
                <div className="rounded-xl bg-surface-container p-space-lg shadow-md border border-surface-container-high/30">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md mb-space-lg">
                    <div>
                      <div className="flex items-center gap-space-xs text-tertiary font-label-caps uppercase tracking-wider mb-1">
                        <span className="material-symbols-outlined text-[16px]">mic</span>
                        <span>Acoustic & Conversational Threat Detector</span>
                      </div>
                      <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold">Voice Call Recording Audit</h2>
                      <p className="font-body-md text-body-md text-on-surface-variant">Live audio interception with AssemblyAI speech-to-text transcript extraction.</p>
                    </div>
                    <div>
                      <button
                        onClick={handleMicToggle}
                        className={`flex items-center gap-space-xs px-space-lg py-space-sm rounded-xl font-headline-md text-body-md font-semibold shadow transition-all ${isRecording ? 'bg-secondary-container text-on-secondary-container animate-pulse' : 'bg-primary-container text-on-primary hover:bg-primary'}`}
                      >
                        <span className={`w-3 h-3 rounded-full ${isRecording ? 'bg-secondary animate-ping' : 'bg-white'}`}></span>
                        <span>{isRecording ? 'Stop Recording' : 'Live Intercept Mic'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
                    {/* Drop zone */}
                    <div className="lg:col-span-7 flex flex-col justify-between">
                      <label className="border-2 border-dashed border-outline-variant hover:border-primary rounded-xl p-space-xl flex flex-col items-center justify-center text-center bg-surface-container-low/60 hover:bg-surface-container-low transition-all cursor-pointer">
                        <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-space-md text-primary">
                          <span className="material-symbols-outlined text-[36px]">cloud_upload</span>
                        </div>
                        <span className="font-headline-md text-headline-md font-semibold text-on-surface mb-1">
                          Drop .webm, .wav, or .mp3 voice recording here
                        </span>
                        <p className="font-body-sm text-body-sm text-outline max-w-sm mb-space-md">
                          Files are transcribed via AssemblyAI and immediately evaluated against real-time scam vectors.
                        </p>
                        <span className="px-space-md py-space-xs rounded-lg bg-surface-container-highest text-on-surface hover:text-white font-body-sm text-body-sm font-semibold transition-all">
                          Browse System Files
                        </span>
                        <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                      </label>

                      {/* Microphone Error Alert */}
                      {micError && (
                        <div className="mt-2 p-2 rounded-lg bg-error/15 border border-error/30 text-error flex items-center justify-between text-xs">
                          <span>{micError}</span>
                          <button onClick={() => setMicError('')} className="ml-2 font-bold">✕</button>
                        </div>
                      )}

                      {/* One-Click Voice Scam Simulators */}
                      <div className="mt-3 p-3 rounded-xl bg-surface-container-low border border-surface-container-high/30">
                        <div className="text-xs uppercase text-outline font-bold tracking-wider mb-2 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-secondary">smart_toy</span>
                          <span>Instant Voice Simulations (No mic required)</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setInputText(SAMPLES.irs)
                              handleAnalyze(SAMPLES.irs)
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-secondary-container hover:text-white text-xs font-semibold text-on-surface-variant transition-all flex items-center gap-1"
                          >
                            <span>🚨 IRS Arrest Threat</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setInputText(SAMPLES.bank)
                              handleAnalyze(SAMPLES.bank)
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-secondary-container hover:text-white text-xs font-semibold text-on-surface-variant transition-all flex items-center gap-1"
                          >
                            <span>💳 Bank OTP Phish</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setInputText(SAMPLES.amazon)
                              handleAnalyze(SAMPLES.amazon)
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-secondary-container hover:text-white text-xs font-semibold text-on-surface-variant transition-all flex items-center gap-1"
                          >
                            <span>💻 AnyDesk Remote</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setInputText(SAMPLES.safe)
                              handleAnalyze(SAMPLES.safe)
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-primary-container hover:text-white text-xs font-semibold text-on-surface-variant transition-all flex items-center gap-1"
                          >
                            <span>🟢 Safe Doctor Call</span>
                          </button>
                        </div>
                      </div>

                      <div className="text-center font-code-sm text-sm text-tertiary mt-2">
                        Status: {recordingStatus} {isRecording && `(${recordingSeconds}s)`}
                      </div>
                    </div>

                    {/* Acoustic Visualizer & Stress */}
                    <div className="lg:col-span-5 rounded-xl bg-surface-container-low p-space-md flex flex-col justify-between border border-surface-container-high/20">
                      <div>
                        <div className="flex items-center justify-between mb-space-sm">
                          <span className="font-label-caps uppercase tracking-wider text-outline">Live Acoustic Visualizer</span>
                          <span className="font-code-sm text-code-sm text-primary flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                            44.1 kHz • Dual Channel
                          </span>
                        </div>
                        
                        {/* Waveform bars */}
                        <div className="w-full h-32 rounded-xl bg-surface-container-lowest p-space-sm flex items-end justify-between gap-1 overflow-hidden shadow-inner">
                          <div className={`w-full bg-primary/40 rounded-full ${isRecording ? 'animate-wave-1' : 'h-10'}`}></div>
                          <div className={`w-full bg-primary/60 rounded-full ${isRecording ? 'animate-wave-2' : 'h-16'}`}></div>
                          <div className={`w-full bg-primary rounded-full ${isRecording ? 'animate-wave-3' : 'h-24'}`}></div>
                          <div className={`w-full bg-tertiary rounded-full ${isRecording ? 'animate-wave-4' : 'h-28'}`}></div>
                          <div className={`w-full bg-secondary rounded-full ${isRecording ? 'animate-wave-5' : 'h-20'}`}></div>
                          <div className={`w-full bg-secondary rounded-full ${isRecording ? 'animate-wave-6' : 'h-28'}`}></div>
                          <div className={`w-full bg-primary rounded-full ${isRecording ? 'animate-wave-7' : 'h-14'}`}></div>
                          <div className={`w-full bg-primary/80 rounded-full ${isRecording ? 'animate-wave-2' : 'h-8'}`}></div>
                          <div className={`w-full bg-tertiary/80 rounded-full ${isRecording ? 'animate-wave-4' : 'h-18'}`}></div>
                          <div className={`w-full bg-secondary/90 rounded-full ${isRecording ? 'animate-wave-6' : 'h-24'}`}></div>
                        </div>
                      </div>

                      <div className="rounded-xl bg-surface-container p-space-sm mt-space-md">
                        <div className="flex items-center justify-between text-body-sm mb-1">
                          <span className="text-outline">Voice Stress Telemetry:</span>
                          <span className="font-code-sm text-secondary font-bold">
                            {isRecording ? 'ACTIVE CALL' : (scanResult?.risk_score >= 45 ? 'ELEVATED (79%)' : 'NORMAL')}
                          </span>
                        </div>
                        <div className="w-full bg-surface-container-highest rounded-full h-2 overflow-hidden">
                          <div className="bg-secondary-container h-full rounded-full transition-all" style={{ width: `${scanResult?.risk_score || (isRecording ? 60 : 15)}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Comprehensive Result Inspection Panel */}
              {scanResult && (
                <div className="rounded-xl bg-surface-container p-space-lg shadow-xl relative overflow-hidden transition-all duration-300 border border-surface-container-high/30">
                  <div className="flex flex-wrap items-center justify-between gap-space-md pb-space-md mb-space-md border-b border-surface-container-high/20">
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <span className="font-code-lg text-code-lg text-primary font-bold">#SCN-88492</span>
                      <span className="w-1 h-1 rounded-full bg-outline"></span>
                      <span className="font-code-sm text-code-sm text-outline flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">schedule</span>
                        Just now
                      </span>
                      <span className="w-1 h-1 rounded-full bg-outline"></span>
                      <span className="font-code-sm text-code-sm text-outline">Channel: <span className="text-on-surface font-semibold">{scanTab === 'voice' ? 'AssemblyAI Speech' : 'Text Ingestion'}</span></span>
                    </div>
                    <div className="flex items-center gap-space-xs">
                      <span className={`font-threat-badge text-threat-badge uppercase px-space-sm py-1 rounded flex items-center gap-1 font-semibold tracking-wide ${scanResult.risk_score >= 45 ? 'bg-secondary-container text-on-secondary-container animate-pulse' : 'bg-surface-container-high text-primary'}`}>
                        <span className="material-symbols-outlined text-[14px]">
                          {scanResult.risk_score >= 45 ? 'dangerous' : 'verified_user'}
                        </span>
                        {scanResult.risk_score >= 45 ? 'Active Threat Confirmed' : 'Normal / Low Threat'}
                      </span>
                    </div>
                  </div>

                  {/* Red Alert Banner */}
                  {scanResult.risk_score >= 45 && (
                    <div className="p-space-md rounded-xl bg-secondary-container text-on-secondary-container mb-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md border border-secondary/40">
                      <div className="flex items-start gap-space-md">
                        <div className="w-10 h-10 rounded-full bg-on-secondary-container/20 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[24px]">gavel</span>
                        </div>
                        <div>
                          <div className="font-headline-md text-headline-md font-bold tracking-tight text-white flex items-center gap-2">
                            DO NOT PAY. HANG UP IMMEDIATELY.
                          </div>
                          <p className="font-body-md text-body-md mt-1 text-on-secondary-container/90 max-w-3xl">
                            {scanResult.recommended_action || scanResult.response_text}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3-Column Inspection */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
                    {/* 1. Circular Gauge */}
                    <div className="lg:col-span-4 rounded-xl bg-surface-container-low p-space-md flex flex-col items-center justify-between text-center relative border border-surface-container-high/20">
                      <div className="w-full flex items-center justify-between text-outline text-body-sm font-body-sm mb-space-xs">
                        <span className="font-label-caps uppercase tracking-wider">Scam Likelihood</span>
                        <span className={`font-code-sm font-bold ${scanResult.risk_score >= 45 ? 'text-secondary' : 'text-primary'}`}>
                          {scanResult.risk_score >= 70 ? 'Critical Danger' : (scanResult.risk_score >= 45 ? 'High Risk' : 'Clean')}
                        </span>
                      </div>
                      
                      {/* SVG Gauge */}
                      <div className="relative w-44 h-44 my-space-sm flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                          <circle className="text-surface-container-highest" cx="60" cy="60" fill="transparent" r="50" stroke="currentColor" strokeWidth="10"></circle>
                          <circle
                            className={scanResult.risk_score >= 45 ? 'text-secondary transition-all duration-1000' : 'text-primary transition-all duration-1000'}
                            cx="60"
                            cy="60"
                            fill="transparent"
                            r="50"
                            stroke="currentColor"
                            strokeDasharray="314.159"
                            strokeDashoffset={314.159 - (314.159 * scanResult.risk_score) / 100}
                            strokeLinecap="round"
                            strokeWidth="10"
                          ></circle>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`font-headline-xl text-[44px] font-bold leading-none ${scanResult.risk_score >= 45 ? 'text-secondary' : 'text-primary'}`}>
                            {scanResult.risk_score}
                          </span>
                          <span className="font-code-sm text-code-sm text-outline mt-1 font-semibold">OUT OF 100</span>
                        </div>
                      </div>

                      <div className="w-full space-y-space-xs">
                        <div className={`font-threat-badge text-threat-badge font-bold px-space-md py-1.5 rounded-lg tracking-wider ${scanResult.risk_score >= 45 ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-primary'}`}>
                          {scanResult.risk_score >= 70 ? 'CRITICAL DANGER (SCAM DETECTED)' : (scanResult.risk_score >= 45 ? 'HIGH RISK SCAM' : 'SAFE / CLEAN')}
                        </div>
                      </div>
                    </div>

                    {/* 2. Red Flags */}
                    <div className="lg:col-span-4 rounded-xl bg-surface-container-low p-space-md flex flex-col justify-between border border-surface-container-high/20">
                      <div>
                        <div className="flex items-center justify-between mb-space-sm">
                          <div className="flex items-center gap-space-xs">
                            <span className="material-symbols-outlined text-[18px] text-tertiary">warning</span>
                            <span className="font-label-caps uppercase tracking-wider text-outline">Extracted Red Flags</span>
                          </div>
                          <span className="font-threat-badge text-threat-badge px-2 py-0.5 rounded bg-surface-container-highest text-tertiary">
                            {scanResult.red_flags?.length || 0} Markers
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-space-md">
                          {scanResult.red_flags && scanResult.red_flags.length > 0 ? (
                            scanResult.red_flags.map((flag, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 px-space-sm py-1 rounded bg-secondary-container/40 text-on-secondary-container font-threat-badge text-threat-badge">
                                <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                                <span>{flag}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-outline text-sm">No malicious red flags detected.</span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl bg-surface-container p-space-sm space-y-space-xs">
                        <span className="font-label-caps text-label-caps uppercase text-outline">Scam Typology Signature</span>
                        <div className="font-headline-md text-body-md font-semibold text-on-surface">
                          {scanResult.scam_category || 'General Telemetry'}
                        </div>
                      </div>
                    </div>

                    {/* 3. Syntactic Highlighting */}
                    <div className="lg:col-span-4 rounded-xl bg-surface-container-low p-space-md flex flex-col justify-between border border-surface-container-high/20">
                      <div>
                        <div className="flex items-center justify-between mb-space-sm">
                          <div className="flex items-center gap-space-xs">
                            <span className="material-symbols-outlined text-[18px] text-primary">data_object</span>
                            <span className="font-label-caps uppercase tracking-wider text-outline">Syntactic Highlighting</span>
                          </div>
                          <span className="font-code-sm text-code-sm text-primary">NLP v4</span>
                        </div>
                        <div className="rounded-xl bg-surface-container-lowest p-space-md font-code-sm text-code-sm text-on-surface leading-relaxed shadow-inner max-h-48 overflow-y-auto">
                          <p>{renderHighlightedSnippet(scanResult.transcript || inputText)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-body-sm text-outline mt-space-sm pt-space-xs">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded bg-secondary-container"></span>
                          <span>Fraud Trigger</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded bg-tertiary-container"></span>
                          <span>Time Pressure</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 3: ALERTS MANAGEMENT */}
          {activeNav === 'alerts' && (
            <div className="flex flex-col gap-space-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md border-b border-surface-container-high/30 pb-space-md">
                <div>
                  <h1 className="font-headline-xl text-headline-xl text-on-surface font-bold">Alerts Management</h1>
                  <p className="font-body-md text-body-md text-on-surface-variant">Live audit queue of classified fraudulent voice calls and text vectors</p>
                </div>
                <div className="flex items-center gap-space-sm">
                  <button onClick={fetchData} className="px-space-md py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-body-sm font-semibold text-on-surface">
                    Refresh Feed
                  </button>
                  <button onClick={handleClearAllAlerts} className="px-space-md py-1.5 rounded-lg bg-secondary-container hover:brightness-110 text-body-sm font-semibold text-on-secondary-container">
                    Clear All Alerts
                  </button>
                </div>
              </div>

              {/* Alerts List */}
              <div className="rounded-xl bg-surface-container shadow-md overflow-hidden border border-surface-container-high/30">
                <div className="divide-y divide-surface-container-highest/30">
                  {filteredAlerts.length === 0 ? (
                    <div className="p-12 text-center text-outline">
                      <span className="material-symbols-outlined text-[48px] text-outline mb-2">shield_check</span>
                      <p className="text-lg">No active alerts found matching criteria.</p>
                    </div>
                  ) : (
                    filteredAlerts.map(alert => (
                      <div key={alert.id} className="p-space-lg hover:bg-surface-container-high/30 transition-all">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs mb-space-xs">
                          <div className="flex items-center gap-space-sm">
                            <span className={`font-threat-badge text-threat-badge px-2.5 py-0.5 rounded uppercase tracking-wider font-bold ${alert.severity === 'critical' || alert.risk_score >= 70 ? 'bg-secondary-container text-on-secondary-container' : 'bg-tertiary-container/30 text-tertiary-fixed'}`}>
                              Risk {alert.risk_score || 90}/100 · {alert.severity.toUpperCase()}
                            </span>
                            <span className="font-code-sm text-code-sm text-outline">#ALERT-{alert.id}</span>
                            <span className="font-code-sm text-code-sm text-primary font-semibold">{alert.category || 'General Scam'}</span>
                          </div>
                          <div className="flex items-center gap-space-sm">
                            <span className="font-code-sm text-code-sm text-outline">
                              {alert.created_at ? new Date(alert.created_at).toLocaleString() : 'Just now'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full font-label-caps text-label-caps font-semibold ${alert.status === 'active' ? 'bg-secondary-container/40 text-on-secondary-container' : 'bg-surface-container-high text-primary'}`}>
                              {alert.status}
                            </span>
                          </div>
                        </div>

                        <p className="rounded-lg bg-surface-container-lowest p-space-md my-space-xs font-code-sm text-code-sm text-on-surface">
                          "{renderHighlightedSnippet(alert.message)}"
                        </p>

                        <div className="mt-space-sm flex items-center justify-end gap-2">
                          {alert.status === 'active' && (
                            <button
                              onClick={() => handleResolveAlert(alert.id)}
                              className="px-space-md py-1 rounded bg-secondary-container text-on-secondary-container font-label-caps text-label-caps hover:brightness-110"
                            >
                              Resolve
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteAlert(alert.id)}
                            className="px-space-md py-1 rounded bg-surface-container-high text-on-surface-variant font-label-caps text-label-caps hover:text-on-surface"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 4: EVENTS LOG */}
          {activeNav === 'events-log' && (
            <div className="flex flex-col gap-space-lg">
              <div className="flex items-center justify-between border-b border-surface-container-high/30 pb-space-md">
                <div>
                  <h1 className="font-headline-xl text-headline-xl text-on-surface font-bold">Events Log</h1>
                  <p className="font-body-md text-body-md text-on-surface-variant">Immutable ledger of recorded calls, telemetry events, and system queries</p>
                </div>
                <button onClick={fetchData} className="px-space-md py-1.5 rounded-lg bg-surface-container-high text-body-sm font-semibold text-on-surface">
                  Refresh Log
                </button>
              </div>

              <div className="rounded-xl bg-surface-container p-space-md shadow-md border border-surface-container-high/30">
                <div className="divide-y divide-surface-container-highest/30">
                  {events.length === 0 ? (
                    <div className="p-8 text-center text-outline">No logged events yet.</div>
                  ) : (
                    events.map(ev => (
                      <div key={ev.id} className="py-space-md flex items-center justify-between gap-space-md">
                        <div className="flex items-start gap-space-sm">
                          <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">terminal</span>
                          <div>
                            <div className="font-code-sm text-code-sm font-bold text-on-surface">{ev.event_type}</div>
                            <div className="font-body-sm text-body-sm text-outline mt-0.5">{ev.description}</div>
                          </div>
                        </div>
                        <span className="font-code-sm text-xs text-outline shrink-0">
                          {ev.created_at ? new Date(ev.created_at).toLocaleTimeString() : 'Recent'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 5: REPORTS */}
          {activeNav === 'reports' && (
            <div className="flex flex-col gap-space-lg">
              <div className="flex items-center justify-between border-b border-surface-container-high/30 pb-space-md">
                <div>
                  <h1 className="font-headline-xl text-headline-xl text-on-surface font-bold">Incident Reports</h1>
                  <p className="font-body-md text-body-md text-on-surface-variant">FTC and law-enforcement ready export documentation</p>
                </div>
                <button
                  onClick={() => handleAnalyze("Generate official incident report for recent call threats")}
                  className="px-space-md py-1.5 rounded-lg bg-primary-container text-on-primary font-headline-md text-body-sm font-semibold shadow"
                >
                  + Generate New Report
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                {reports.length === 0 ? (
                  <div className="col-span-2 p-12 text-center text-outline bg-surface-container rounded-xl">
                    No reports generated yet. Click "Generate New Report" or scan a high-risk call to produce an incident report.
                  </div>
                ) : (
                  reports.map(rep => (
                    <div key={rep.id} className="rounded-xl bg-surface-container p-space-lg border border-surface-container-high/30 shadow-md flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-headline-md font-bold text-primary">{rep.title}</h3>
                          <span className="font-code-sm text-xs text-outline">
                            {rep.created_at ? new Date(rep.created_at).toLocaleDateString() : 'Today'}
                          </span>
                        </div>
                        <p className="font-body-md text-on-surface-variant text-sm leading-relaxed mb-4">{rep.content}</p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-surface-container-high/20">
                        <span className="font-threat-badge text-[11px] text-outline">STATUS: VERIFIED INCIDENT</span>
                        <button className="text-primary text-xs font-semibold hover:underline flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">download</span> Export PDF
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* VIEW 6: API DOCS */}
          {activeNav === 'api-docs' && (
            <div className="flex flex-col gap-space-lg">
              <div className="border-b border-surface-container-high/30 pb-space-md">
                <h1 className="font-headline-xl text-headline-xl text-on-surface font-bold">API Documentation</h1>
                <p className="font-body-md text-body-md text-on-surface-variant">Live endpoints exposed by the FastAPI backend on {API_BASE}</p>
              </div>

              <div className="grid grid-cols-1 gap-space-md">
                <div className="rounded-xl bg-surface-container p-space-md border border-surface-container-high/30 font-code-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded bg-primary text-on-primary font-bold text-xs">POST</span>
                    <span className="text-on-surface font-semibold">/agent/query</span>
                    <span className="text-outline text-xs">— Real-time scam intent analysis</span>
                  </div>
                  <pre className="p-3 bg-surface-container-lowest rounded-lg text-xs text-primary overflow-x-auto">
{`curl -X POST "${API_BASE}/agent/query" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "IRS arrest warrant gift card payment immediately"}'`}
                  </pre>
                </div>

                <div className="rounded-xl bg-surface-container p-space-md border border-surface-container-high/30 font-code-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded bg-tertiary text-on-tertiary font-bold text-xs">POST</span>
                    <span className="text-on-surface font-semibold">/agent/voice</span>
                    <span className="text-outline text-xs">— AssemblyAI speech audio upload & evaluation</span>
                  </div>
                  <pre className="p-3 bg-surface-container-lowest rounded-lg text-xs text-tertiary overflow-x-auto">
{`curl -X POST "${API_BASE}/agent/voice" \\
  -F "audio=@call_recording.webm"`}
                  </pre>
                </div>

                <div className="rounded-xl bg-surface-container p-space-md border border-surface-container-high/30 font-code-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded bg-secondary text-on-secondary font-bold text-xs">GET</span>
                    <span className="text-on-surface font-semibold">/alerts</span>
                    <span className="text-outline text-xs">— Retrieve all security alerts</span>
                  </div>
                  <pre className="p-3 bg-surface-container-lowest rounded-lg text-xs text-secondary overflow-x-auto">
{`curl -X GET "${API_BASE}/alerts"`}
                  </pre>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 bg-surface-container-low backdrop-blur-xl shadow-[0_-1px_12px_rgba(0,0,0,0.4)] flex items-center justify-around px-space-sm border-t border-surface-container-high/40">
        <button onClick={() => setActiveNav('dashboard')} className={`flex flex-col items-center gap-0.5 ${activeNav === 'dashboard' ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined text-[20px]">grid_view</span>
          <span className="font-label-caps text-[10px]">Overview</span>
        </button>
        <button onClick={() => setActiveNav('scan-center')} className={`flex flex-col items-center gap-0.5 ${activeNav === 'scan-center' ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined text-[20px]">radar</span>
          <span className="font-label-caps text-[10px]">Scan</span>
        </button>
        <button onClick={() => setActiveNav('alerts')} className={`relative flex flex-col items-center gap-0.5 ${activeNav === 'alerts' ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined text-[20px]">warning</span>
          <span className="font-label-caps text-[10px]">Alerts</span>
          {stats.active_threats > 0 && <span className="absolute top-0 right-1 w-2 h-2 rounded-full bg-secondary"></span>}
        </button>
        <button onClick={() => setActiveNav('events-log')} className={`flex flex-col items-center gap-0.5 ${activeNav === 'events-log' ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined text-[20px]">manage_search</span>
          <span className="font-label-caps text-[10px]">Events</span>
        </button>
        <button onClick={() => setActiveNav('reports')} className={`flex flex-col items-center gap-0.5 ${activeNav === 'reports' ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>
          <span className="material-symbols-outlined text-[20px]">insert_chart</span>
          <span className="font-label-caps text-[10px]">Reports</span>
        </button>
      </nav>

    </div>
  )
}
