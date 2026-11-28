import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FC, FormEvent, ReactNode } from 'react';
import type { AuthUser } from '../types/auth';
import { apiUrl, extractApiErrorMessage, parseJsonSafe } from '../lib/api';
import {
  Mic,
  MicOff,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  Minimize2,
  MessageSquare,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

interface AssistantStatusResponse {
  status: string;
  mode: 'gemini' | 'local_knowledge_base' | string;
  llm_configured: boolean;
  model?: string | null;
  voice_browser_supported: boolean;
  voice_server_audio_supported: boolean;
  welcome?: {
    greeting: string;
    role: string;
    suggested_questions: string[];
  };
}

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  voiceScript?: string;
  mode?: string;
  sources?: string[];
  suggestedQuestions?: string[];
}

interface FloatingAIAgentProps {
  user: AuthUser | null;
  activeView: string;
  activeProtocolTitle?: string | null;
  onSessionExpired?: () => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function buildInitialGreeting(user: AuthUser): AgentMessage {
  const role = String(user.role || 'patient').toLowerCase().trim();
  const cleanName = user.name?.trim() || 'there';

  if (role === 'admin') {
    return {
      id: `welcome-${user.id}`,
      role: 'assistant',
      content:
        `Welcome, **${cleanName}**! You are signed in to the **Administrator Console**.\n\n` +
        `Ask me anything about ProtocolShield — user governance, cohort seeding, 21 CFR Part 11 SHA-256 audits, or clinical terms like **ECOG**, **eGFR**, or **PBI**.`,
      voiceScript: `Welcome, ${cleanName}. You are signed in to the Administrator Console. Ask me anything about ProtocolShield or clinical trial terms.`,
      sources: ['ProtocolShield Administrator Guide'],
      suggestedQuestions: [
        'Why and what is the use of this project?',
        'Explain 21 CFR Part 11 & SHA-256 audit chain',
        'What is the full form of ECOG and GCRGR / eGFR?',
      ],
    };
  }

  if (role === 'doctor') {
    return {
      id: `welcome-${user.id}`,
      role: 'assistant',
      content:
        `Welcome, **${cleanName}**! You are signed in to the **Doctor / Investigator Studio**.\n\n` +
        `I can explain **PBI friction weights**, **Schedule of Assessments**, **FDORA equity metrics**, or any clinical term in simple language.`,
      voiceScript: `Welcome, ${cleanName}. You are signed in to the Doctor Studio. I can explain Patient Burden Index, Schedule of Assessments, or any clinical rule.`,
      sources: ['ProtocolShield Clinical Studio Guide'],
      suggestedQuestions: [
        'What is the Patient Burden Index (PBI)?',
        'What is FDORA and why is it important?',
        'What is the full form of ECOG and eGFR?',
      ],
    };
  }

  return {
    id: `welcome-${user.id}`,
    role: 'assistant',
    content:
      `Welcome, **${cleanName}**! You are signed in to the **Patient Portal**.\n\n` +
      `Ask me any question — like what **ECOG**, **eGFR** (or *GCRGR*), or **ANC** mean, why doctors check them, or how ProtocolShield works.`,
    voiceScript: `Welcome, ${cleanName}. You are signed in to the Patient Portal. Ask me any question about lab terms like ECOG or eGFR, or how this project helps you.`,
    sources: ['ProtocolShield Patient Guide'],
    suggestedQuestions: [
      'What is the full form of ECOG?',
      'What is GCRGR or eGFR and why is it important?',
      'Why and what is the use of this project?',
    ],
  };
}

function renderInlineFormatting(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*\n]+?\*\*|\*[^\s*][^*\n]*?\*|`[^`\n]+?`)/g);
  return tokens.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-charcoal-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={idx} className="italic text-charcoal-700">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={idx} className="px-1 py-0.5 rounded bg-linen-200/80 text-[11px] font-mono text-charcoal-900">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function renderFormattedReply(content: string): ReactNode {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-charcoal-800">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-0.5" />;
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
          return (
            <div key={i} className="flex items-start gap-1.5 pl-1">
              <span className="text-terracotta-600 font-bold mt-0.5">•</span>
              <span>{renderInlineFormatting(trimmed.slice(2).trimStart())}</span>
            </div>
          );
        }
        const numberedMatch = trimmed.match(/^(\d+\.)\s+(.+)$/);
        if (numberedMatch) {
          return (
            <div key={i} className="flex items-start gap-1.5 pl-1">
              <span className="text-terracotta-700 font-mono font-semibold shrink-0">{numberedMatch[1]}</span>
              <span>{renderInlineFormatting(numberedMatch[2])}</span>
            </div>
          );
        }
        return <p key={i}>{renderInlineFormatting(trimmed)}</p>;
      })}
    </div>
  );
}

const AgentAvatar: FC<{ isActive?: boolean; isSpeaking?: boolean; size?: 'sm' | 'lg' }> = ({
  isActive = false,
  isSpeaking = false,
  size = 'lg',
}) => {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-12 w-12';
  return (
    <div className={`relative ${dim} shrink-0 flex items-center justify-center`}>
      {(isActive || isSpeaking) && (
        <span className="absolute inset-0 rounded-full bg-terracotta-400/35 animate-ping" />
      )}
      <svg
        viewBox="0 0 64 64"
        className={`${dim} rounded-full shadow-sm border-2 ${
          isActive ? 'border-terracotta-400' : 'border-white/90'
        }`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="psAgentBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1E242B" />
            <stop offset="100%" stopColor="#3B4754" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="32" fill="url(#psAgentBg)" />
        {/* Clinical guide shoulders / collar */}
        <path d="M14 58c3-11 11-15 18-15s15 4 18 15" fill="#FBF9F6" />
        <path d="M27 43l5 7 5-7" fill="none" stroke="#C85A42" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {/* Warm human-friendly assistant head */}
        <circle cx="32" cy="27" r="11" fill="#F4DCCB" />
        {/* Hair / visor accent */}
        <path d="M21 25c1-8 7-11 11-11s10 3 11 11c-3-3-7-4-11-4s-8 1-11 4z" fill="#2A3139" />
        {/* Friendly eyes */}
        <circle cx="28" cy="27" r="1.4" fill="#1E242B" />
        <circle cx="36" cy="27" r="1.4" fill="#1E242B" />
        {/* Friendly smile */}
        <path
          d={isSpeaking ? 'M28 31.5c1.8 2.2 6.2 2.2 8 0' : 'M28 31.5c2 1.6 6 1.6 8 0'}
          fill="none"
          stroke="#C85A42"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* Voice headset arc & mic dot */}
        <path d="M19 28a13 13 0 0 1 26 0" fill="none" stroke="#5D8B74" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="19" cy="29" r="2.6" fill="#5D8B74" />
        <circle cx="45" cy="29" r="2.6" fill="#5D8B74" />
      </svg>
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
          isActive ? 'bg-red-500' : 'bg-sage-500'
        }`}
      />
    </div>
  );
};

const FloatingAIAgentInner: FC<FloatingAIAgentProps & { user: AuthUser }> = ({
  user,
  activeView,
  activeProtocolTitle,
  onSessionExpired,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showWelcomeBubble, setShowWelcomeBubble] = useState(true);
  const [messages, setMessages] = useState<AgentMessage[]>(() => [buildInitialGreeting(user)]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<AssistantStatusResponse | null>(null);

  // Voice Mode states
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const speechSynthesisSupported =
    typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
  const speechRecognitionCtor = useMemo(() => getSpeechRecognitionCtor(), []);

  // Fetch capability status asynchronously (setState only after await)
  useEffect(() => {
    const controller = new AbortController();
    async function loadAssistantStatus() {
      try {
        const headers: Record<string, string> = {};
        if (user.token) {
          headers.Authorization = `Bearer ${user.token}`;
        }
        const res = await fetch(apiUrl('/api/v1/assistant/status'), {
          headers,
          signal: controller.signal,
        });
        if (!res.ok || controller.signal.aborted) return;
        const data = (await parseJsonSafe(res)) as AssistantStatusResponse | null;
        if (data && typeof data.mode === 'string' && !controller.signal.aborted) {
          setStatusInfo(data);
        }
      } catch {
        // Silently keep local defaults if unreachable in isolated component tests
      }
    }
    void loadAssistantStatus();
    return () => {
      controller.abort();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      recognitionRef.current?.stop();
    };
  }, [user.token]);

  useEffect(() => {
    if (isOpen && messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages.length]);

  const stopSpeaking = useCallback(() => {
    if (speechSynthesisSupported) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, [speechSynthesisSupported]);

  const speakText = useCallback(
    (text: string) => {
      if (!speechSynthesisSupported || !text.trim()) return;
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text.replace(/[*`#]/g, ''));
        utter.rate = 1.0;
        utter.pitch = 1.0;
        utter.onstart = () => setIsSpeaking(true);
        utter.onend = () => setIsSpeaking(false);
        utter.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utter);
      } catch {
        setIsSpeaking(false);
      }
    },
    [speechSynthesisSupported]
  );

  const sendQuestion = useCallback(
    async (rawQuestion: string, autoSpeak = false) => {
      const trimmed = rawQuestion.trim();
      if (!trimmed || isSending) return;

      const userMsg: AgentMessage = {
        id: `usr-${Date.now()}`,
        role: 'user',
        content: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInputValue('');
      setErrorMsg(null);
      setIsSending(true);

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (user.token) {
          headers.Authorization = `Bearer ${user.token}`;
        }
        const historyPayload = messages
          .slice(-6)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 900) }));

        const res = await fetch(apiUrl('/api/v1/assistant/chat'), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: trimmed,
            history: historyPayload,
            client_context: {
              active_view: activeView,
              active_protocol: activeProtocolTitle || '',
            },
          }),
        });

        if (res.status === 401) {
          onSessionExpired?.();
          return;
        }

        const data = (await parseJsonSafe(res)) as {
          reply?: string;
          voice_script?: string;
          mode?: string;
          sources?: string[];
          suggested_questions?: string[];
          detail?: unknown;
        } | null;

        if (!res.ok || !data?.reply) {
          setErrorMsg(extractApiErrorMessage(data, 'Assistant could not answer right now.'));
          return;
        }

        const assistantMsg: AgentMessage = {
          id: `ast-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          voiceScript: data.voice_script || data.reply,
          mode: data.mode,
          sources: Array.isArray(data.sources) ? data.sources : [],
          suggestedQuestions: Array.isArray(data.suggested_questions) ? data.suggested_questions : [],
        };
        setMessages((prev) => [...prev, assistantMsg]);

        if (autoSpeak || voiceModeEnabled) {
          speakText(assistantMsg.voiceScript || assistantMsg.content);
        }
      } catch {
        setErrorMsg('Network error reaching ProtocolShield Assistant.');
      } finally {
        setIsSending(false);
      }
    },
    [
      isSending,
      user.token,
      messages,
      activeView,
      activeProtocolTitle,
      onSessionExpired,
      voiceModeEnabled,
      speakText,
    ]
  );

  const handleServerAudioClip = useCallback(
    async (blob: Blob, mimeType: string) => {
      setIsSending(true);
      setErrorMsg(null);
      try {
        const formData = new FormData();
        formData.append('audio', blob, 'voice-query.webm');
        formData.append(
          'client_context',
          JSON.stringify({
            active_view: activeView,
            active_protocol: activeProtocolTitle || '',
          })
        );
        const headers: Record<string, string> = {};
        if (user.token) {
          headers.Authorization = `Bearer ${user.token}`;
        }
        const res = await fetch(apiUrl('/api/v1/assistant/voice-chat'), {
          method: 'POST',
          headers,
          body: formData,
        });
        if (res.status === 401) {
          onSessionExpired?.();
          return;
        }
        const data = (await parseJsonSafe(res)) as {
          transcript?: string;
          reply?: string;
          voice_script?: string;
          mode?: string;
          sources?: string[];
          suggested_questions?: string[];
          detail?: unknown;
        } | null;

        if (!res.ok || !data?.reply) {
          setErrorMsg(extractApiErrorMessage(data, 'Could not process voice clip.'));
          return;
        }

        const userMsg: AgentMessage = {
          id: `usr-aud-${Date.now()}`,
          role: 'user',
          content: `🎤 ${data.transcript || '(Spoken audio query)'}`,
        };
        const assistantMsg: AgentMessage = {
          id: `ast-aud-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          voiceScript: data.voice_script || data.reply,
          mode: data.mode,
          sources: Array.isArray(data.sources) ? data.sources : [],
          suggestedQuestions: Array.isArray(data.suggested_questions) ? data.suggested_questions : [],
        };
        setMessages((prev) => [...prev, userMsg, assistantMsg]);
        if (voiceModeEnabled) {
          speakText(assistantMsg.voiceScript || assistantMsg.content);
        }
      } catch {
        setErrorMsg(`Audio upload failed (${mimeType}). Try browser speech recognition or text chat.`);
      } finally {
        setIsSending(false);
      }
    },
    [activeView, activeProtocolTitle, user.token, onSessionExpired, voiceModeEnabled, speakText]
  );

  const toggleVoiceCapture = async () => {
    setVoiceNotice(null);
    setErrorMsg(null);

    if (isListening) {
      recognitionRef.current?.stop();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    stopSpeaking();
    setVoiceModeEnabled(true);

    // 1. Prefer Web Speech API for zero-latency browser Voice Mode
    if (speechRecognitionCtor) {
      try {
        const recognition = new speechRecognitionCtor();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;

        let finalTranscript = '';
        recognition.onresult = (event) => {
          let collected = '';
          for (let i = 0; i < event.results.length; i += 1) {
            const seg = event.results[i];
            collected += seg[0]?.transcript || '';
            if (seg.isFinal) {
              finalTranscript = collected.trim();
            }
          }
          setInputValue(collected);
        };

        recognition.onerror = (ev) => {
          setIsListening(false);
          const errCode = ev.error || 'unknown';
          if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
            setVoiceNotice('Microphone access blocked. Allow mic permission in browser or type your question.');
          } else if (errCode !== 'aborted' && errCode !== 'no-speech') {
            setVoiceNotice(`Voice recognition error (${errCode}). You can type or retry.`);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          if (finalTranscript.trim()) {
            void sendQuestion(finalTranscript.trim(), true);
          }
        };

        recognitionRef.current = recognition;
        setIsListening(true);
        recognition.start();
        return;
      } catch {
        setIsListening(false);
      }
    }

    // 2. Fallback to MediaRecorder -> /api/v1/assistant/voice-chat when server Gemini Audio is enabled
    if (
      statusInfo?.voice_server_audio_supported &&
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
        const recorder = new MediaRecorder(stream, { mimeType: mime });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunks.push(ev.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          setIsListening(false);
          if (chunks.length > 0) {
            const blob = new Blob(chunks, { type: mime });
            void handleServerAudioClip(blob, mime);
          }
        };
        mediaRecorderRef.current = recorder;
        setIsListening(true);
        recorder.start();
        setVoiceNotice('Recording voice clip... click mic again to send.');
        return;
      } catch {
        setIsListening(false);
        setVoiceNotice('Unable to open microphone. Check browser mic permission or type your question.');
        return;
      }
    }

    setVoiceNotice(
      'Voice input is not supported in this browser without server Gemini audio. Text chat & Read-Aloud remain active.'
    );
  };

  const handleToggleVoiceMode = () => {
    const next = !voiceModeEnabled;
    setVoiceModeEnabled(next);
    setVoiceNotice(null);
    if (!next) {
      stopSpeaking();
    } else {
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant) {
        speakText(lastAssistant.voiceScript || lastAssistant.content);
      }
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendQuestion(inputValue, voiceModeEnabled);
  };

  const modeLabel = statusInfo?.llm_configured
    ? `Gemini AI • Grounded`
    : 'Verified Knowledge Base';

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2.5 max-w-[calc(100vw-2rem)]">
      {/* ── Expanded AI Agent Chat & Voice Drawer ───────────────────────────── */}
      {isOpen && (
        <section
          aria-label="ProtocolShield AI Guide Assistant"
          className="w-[370px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[78vh] bg-white border border-linen-300 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Drawer Header */}
          <div className="bg-charcoal-950 text-white px-4 py-3 flex items-center justify-between gap-2 border-b border-charcoal-800 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <AgentAvatar isActive={isListening} isSpeaking={isSpeaking} size="sm" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-serif font-bold text-sm truncate">ProtocolShield Guide</span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-sage-400 shrink-0" />
                </div>
                <span className="text-[10px] font-mono text-charcoal-300 block truncate">
                  {modeLabel}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleToggleVoiceMode}
                title={voiceModeEnabled ? 'Disable Spoken Voice Mode' : 'Enable Spoken Voice Mode'}
                aria-label={voiceModeEnabled ? 'Disable Voice Mode' : 'Enable Voice Mode'}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                  voiceModeEnabled
                    ? 'bg-terracotta-600 text-white'
                    : 'bg-charcoal-800 text-charcoal-300 hover:text-white'
                }`}
              >
                {voiceModeEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                <span>{voiceModeEnabled ? 'Voice ON' : 'Voice'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Minimize AI Agent"
                className="p-1.5 rounded-lg text-charcoal-400 hover:text-white hover:bg-charcoal-800 cursor-pointer"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Truthful Zero-Hallucination Notice */}
          <div className="px-3.5 py-1.5 bg-linen-100 border-b border-linen-200 flex items-center justify-between text-[10px] font-mono text-charcoal-600 shrink-0">
            <span className="flex items-center gap-1 truncate">
              <ShieldCheck className="h-3 w-3 text-sage-600 shrink-0" />
              <span>Grounded explanations • Zero invented claims</span>
            </span>
            {isSpeaking && (
              <button
                type="button"
                onClick={stopSpeaking}
                className="text-terracotta-700 hover:underline font-semibold cursor-pointer shrink-0 ml-2"
              >
                Stop audio
              </button>
            )}
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-linen-50/60">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 shadow-2xs ${
                    msg.role === 'user'
                      ? 'bg-charcoal-900 text-white text-xs rounded-br-sm'
                      : 'bg-white border border-linen-200 rounded-bl-sm'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="text-xs leading-relaxed">{msg.content}</p>
                  ) : (
                    renderFormattedReply(msg.content)
                  )}

                  {msg.role === 'assistant' && (
                    <div className="mt-2 pt-1.5 border-t border-linen-100 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-charcoal-400 truncate">
                        {msg.sources?.[0] || 'Verified Guide'}
                      </span>
                      {speechSynthesisSupported && (
                        <button
                          type="button"
                          onClick={() => speakText(msg.voiceScript || msg.content)}
                          className="inline-flex items-center gap-1 text-[10px] font-mono text-terracotta-700 hover:text-terracotta-800 cursor-pointer shrink-0"
                        >
                          <Volume2 className="h-3 w-3" />
                          <span>Speak</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Clickable starter / follow-up question chips */}
                {msg.role === 'assistant' &&
                  msg.suggestedQuestions &&
                  msg.suggestedQuestions.length > 0 &&
                  msg.id === messages[messages.length - 1]?.id && (
                    <div className="mt-2 flex flex-wrap gap-1.5 max-w-[95%]">
                      {msg.suggestedQuestions.slice(0, 3).map((q) => (
                        <button
                          key={q}
                          type="button"
                          disabled={isSending}
                          onClick={() => void sendQuestion(q, voiceModeEnabled)}
                          className="px-2.5 py-1 rounded-full bg-white hover:bg-linen-100 border border-linen-300 text-[11px] text-charcoal-700 hover:text-charcoal-900 transition-colors cursor-pointer text-left"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            ))}

            {isSending && (
              <div className="flex items-start">
                <div className="px-3.5 py-2.5 rounded-2xl bg-white border border-linen-200 text-xs font-mono text-charcoal-500">
                  Thinking from verified facts...
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            {voiceNotice && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                {voiceNotice}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input & Mic Composer */}
          <form
            onSubmit={handleFormSubmit}
            className="p-2.5 bg-white border-t border-linen-200 flex items-center gap-2 shrink-0"
          >
            <button
              type="button"
              onClick={() => void toggleVoiceCapture()}
              aria-label={isListening ? 'Stop voice input' : 'Ask with voice microphone'}
              title={isListening ? 'Listening... click to stop' : 'Ask via Voice Microphone'}
              className={`p-2 rounded-xl border transition-all cursor-pointer shrink-0 ${
                isListening
                  ? 'bg-red-600 text-white border-red-600 animate-pulse'
                  : 'bg-linen-100 text-charcoal-700 border-linen-300 hover:bg-linen-200'
              }`}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>

            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isListening ? 'Listening to your voice...' : 'Ask any project or term (ECOG, eGFR...)'}
              className="flex-1 min-w-0 px-3 py-2 text-xs bg-linen-50 border border-linen-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta-500/20 focus:border-terracotta-500"
            />

            <button
              type="submit"
              disabled={isSending || !inputValue.trim()}
              aria-label="Send question"
              className="p-2 rounded-xl bg-charcoal-900 hover:bg-charcoal-800 text-white disabled:opacity-40 cursor-pointer shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}

      {/* ── Auto-Welcome Floating Greeting Bubble (After Sign-In) ───────────── */}
      {!isOpen && showWelcomeBubble && (
        <div
          role="status"
          className="w-72 sm:w-80 bg-white border border-linen-300 rounded-2xl shadow-xl p-3.5 text-xs space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-semibold text-terracotta-700 uppercase tracking-wider">
              <Sparkles className="h-3 w-3" />
              <span>Welcome, {user.name.split(' ')[0]}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowWelcomeBubble(false)}
              aria-label="Dismiss welcome greeting"
              className="text-charcoal-400 hover:text-charcoal-700 p-0.5 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="text-xs text-charcoal-700 leading-relaxed">
            I&apos;m your ProtocolShield AI Guide! Ask me about any term like{' '}
            <strong className="text-charcoal-900">ECOG</strong>,{' '}
            <strong className="text-charcoal-900">eGFR</strong>,{' '}
            <strong className="text-charcoal-900">PBI</strong>, or why this platform matters — by typing or Voice Mode.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowWelcomeBubble(false);
                setIsOpen(true);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-charcoal-900 hover:bg-charcoal-800 text-white text-[11px] font-semibold cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5 text-terracotta-300" />
              <span>Chat with Agent</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowWelcomeBubble(false);
                setVoiceModeEnabled(true);
                setIsOpen(true);
                speakText(messages[0]?.voiceScript || '');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 border border-linen-300 text-[11px] font-semibold text-charcoal-800 cursor-pointer"
            >
              <Mic className="h-3.5 w-3.5 text-terracotta-600" />
              <span>Voice Mode</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Floating Avatar Launcher Pill (Bottom Right) ────────────────────── */}
      <button
        type="button"
        onClick={() => {
          setShowWelcomeBubble(false);
          setIsOpen((prev) => !prev);
        }}
        aria-label={isOpen ? 'Close ProtocolShield AI Agent' : 'Open ProtocolShield AI Agent'}
        className="group flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-charcoal-950 hover:bg-charcoal-900 text-white border border-charcoal-800 shadow-xl transition-all cursor-pointer"
      >
        <AgentAvatar isActive={isListening} isSpeaking={isSpeaking} size="sm" />
        <div className="text-left">
          <span className="text-xs font-semibold block leading-tight">ProtocolShield AI</span>
          <span className="text-[10px] font-mono text-charcoal-300 block">
            {isListening ? 'Listening...' : voiceModeEnabled ? 'Voice Mode Active' : 'Ask or Voice'}
          </span>
        </div>
      </button>
    </div>
  );
};

export const FloatingAIAgent: FC<FloatingAIAgentProps> = ({
  user,
  activeView,
  activeProtocolTitle,
  onSessionExpired,
}) => {
  if (!user) return null;

  return (
    <FloatingAIAgentInner
      key={`${user.id}:${String(user.role || 'patient').toLowerCase().trim()}`}
      user={user}
      activeView={activeView}
      activeProtocolTitle={activeProtocolTitle}
      onSessionExpired={onSessionExpired}
    />
  );
};
