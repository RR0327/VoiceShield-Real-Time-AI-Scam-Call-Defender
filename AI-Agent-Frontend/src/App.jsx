import { useState, useRef } from 'react'
import './index.css'

function App() {
  const [isListening, setIsListening] = useState(false)
  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState('Idle')
  const [inputText, setInputText] = useState('')

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  const handleSendText = async (text) => {
    if (!text.trim()) return
    setStatus('Processing...')
    const newUserMsg = { sender: 'user', text, time: new Date().toLocaleTimeString() }
    setMessages(prev => [...prev, newUserMsg])
    setInputText('')

    try {
      const response = await fetch('http://localhost:8000/agent/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      const data = await response.json()
      
      const newAgentMsg = { 
        sender: 'agent', 
        text: data.response_text || `Action: ${data.action}`, 
        decision: data.decision,
        severity: data.severity,
        time: new Date().toLocaleTimeString() 
      }
      setMessages(prev => [...prev, newAgentMsg])
      setStatus('Idle')
    } catch (error) {
      console.error(error)
      setStatus('Error connecting to backend')
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        audioChunksRef.current = []
        await uploadAudio(audioBlob)
      }
      
      mediaRecorderRef.current.start()
      setIsListening(true)
      setStatus('Recording... (Speak now)')
    } catch (err) {
      console.error("Mic access denied:", err)
      setStatus("Error: Mic Access Denied")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
      setIsListening(false)
      setStatus('Transcribing with AssemblyAI...')
    }
  }

  const handleSpeech = () => {
    if (isListening) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const uploadAudio = async (blob) => {
    const formData = new FormData()
    formData.append("audio", blob, "recording.webm")

    try {
      const response = await fetch('http://localhost:8000/agent/voice', {
        method: 'POST',
        body: formData
      })
      const data = await response.json()
      
      // We also add the AssemblyAI transcript as a user message so they can see what was actually heard!
      if (data.transcript) {
         setMessages(prev => [...prev, { sender: 'user', text: `🎤 AssemblyAI Heard: "${data.transcript}"`, time: new Date().toLocaleTimeString() }])
      }

      const newAgentMsg = { 
        sender: 'agent', 
        text: data.response_text || `Action: ${data.action}`, 
        decision: data.decision,
        severity: data.severity,
        time: new Date().toLocaleTimeString() 
      }
      setMessages(prev => [...prev, newAgentMsg])
      setStatus('Idle')
    } catch (error) {
      console.error(error)
      setStatus('Error connecting to backend')
    }
  }

  return (
    <div className="app-container">
      <div className="glass-panel main-dashboard">
        <header className="dashboard-header">
          <div className="brand">
            <div className="pulse-indicator"></div>
            <h1>VoiceShield AI</h1>
          </div>
          <div className={`status-badge ${status.toLowerCase().replace(/[ .:\(\)]/g, '')}`}>
            {status}
          </div>
        </header>

        <div className="chat-container">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🎙️</div>
              <h2>Ready for AssemblyAI Voice Commands</h2>
              <p>Click the microphone, wait for it to say "Recording", and say something like "Emergency detected"!</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`message-wrapper ${msg.sender}`}>
                <div className="message">
                  {msg.sender === 'agent' && (
                    <div className="msg-meta">
                      <span className={`tag severity-${msg.severity}`}>{msg.severity}</span>
                      <span className="tag decision">{msg.decision}</span>
                    </div>
                  )}
                  <p>{msg.text}</p>
                  <span className="time">{msg.time}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="controls-container" style={{ display: 'flex', gap: '16px', width: '100%' }}>
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText(inputText)}
            placeholder="Or type a command here..." 
            style={{ flex: 1, padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', fontSize: '1rem' }}
          />
          <button 
            className={`mic-button ${isListening ? 'listening' : ''}`}
            onClick={handleSpeech}
            style={{ padding: '16px 24px', flexShrink: 0 }}
          >
            {isListening ? (
              <span className="material-icon">🛑 Stop Recording</span>
            ) : (
              <span className="material-icon">🎙️ Record Voice</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
