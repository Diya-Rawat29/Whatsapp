'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  MessageCircle,
  BarChart3,
  KeyRound,
  Send,
  Trash2,
  PhoneCall,
  Activity,
  Calendar,
  Zap,
  Bot,
  Plug,
  Pause,
  Play,
  Settings2
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5001';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  _id: string;
  from: string;
  contact: string;
  body: string;
  reply: string;
  replyType: 'keyword' | 'ai' | 'none';
  timestamp: string;
}

interface Rule {
  _id: string;
  keyword: string;
  reply: string;
  matchType: 'exact' | 'contains';
  isActive: boolean;
  hitCount: number;
  createdAt: string;
}

interface Stats {
  totalMessages: number;
  aiReplies: number;
  keywordReplies: number;
  totalRules: number;
  todayMessages: number;
}

type Tab = 'dashboard' | 'messages' | 'rules' | 'send';
type WaStatus = 'disconnected' | 'qr' | 'connected';

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="glass-panel rounded-3xl p-6 relative overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 transition-opacity duration-300 group-hover:opacity-40" 
           style={{ background: color, transform: 'translate(40%, -40%)' }} />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="p-3 rounded-2xl" style={{ background: `${color}15`, color }}>
            {icon}
          </div>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full" 
                style={{ background: `${color}15`, border: `1px solid ${color}30`, color }}>
            {label}
          </span>
        </div>
        <div className="text-4xl font-bold tracking-tight text-white">{value.toLocaleString()}</div>
      </div>
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ type }: { type: 'keyword' | 'ai' | 'none' }) {
  if (type === 'keyword') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide bg-[#25D36615] text-[#25D366] border border-[#25D36630]">
        <KeyRound size={12} /> Keyword
      </span>
    );
  }
  if (type === 'ai') {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide bg-[#8b5cf615] text-[#a78bfa] border border-[#8b5cf630]">
        <Bot size={12} /> Gemini AI
      </span>
    );
  }
  return null;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [waStatus, setWaStatus] = useState<WaStatus>('disconnected');
  const [qrCode, setQrCode] = useState('');
  const [statusMsg, setStatusMsg] = useState('Connecting...');
  const [messages, setMessages] = useState<Message[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [newRule, setNewRule] = useState({ keyword: '', reply: '', matchType: 'contains' });
  const [sendForm, setSendForm] = useState({ to: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');
  const [ruleLoading, setRuleLoading] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);

  // Fetch data
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/messages`);
      const data = await res.json();
      setMessages(data);
    } catch (e) {}
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/rules`);
      const data = await res.json();
      setRules(data);
    } catch (e) {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/stats`);
      const data = await res.json();
      setStats(data);
    } catch (e) {}
  }, []);

  useEffect(() => {
    // Socket.IO
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => console.log('Socket connected'));
    socket.on('status', ({ status, message }: { status: WaStatus; message: string }) => {
      setWaStatus(status);
      setStatusMsg(message);
    });
    socket.on('qr', (qr: string) => {
      setQrCode(qr);
      setWaStatus('qr');
    });
    socket.on('new_message', (msg: Message) => {
      setMessages(prev => [msg, ...prev]);
      fetchStats();
    });

    // Initial data
    fetchMessages();
    fetchRules();
    fetchStats();

    return () => { socket.disconnect(); };
  }, [fetchMessages, fetchRules, fetchStats]);

  // Auto-scroll
  useEffect(() => {
    if (tab === 'messages') {
      msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, tab]);

  // Add Rule
  const addRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.keyword.trim() || !newRule.reply.trim()) return;
    setRuleLoading(true);
    await fetch(`${API}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRule),
    });
    setNewRule({ keyword: '', reply: '', matchType: 'contains' });
    await fetchRules();
    await fetchStats();
    setRuleLoading(false);
  };

  // Toggle Rule
  const toggleRule = async (id: string, isActive: boolean) => {
    await fetch(`${API}/api/rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    });
    await fetchRules();
  };

  // Delete Rule
  const deleteRule = async (id: string) => {
    await fetch(`${API}/api/rules/${id}`, { method: 'DELETE' });
    await fetchRules();
    await fetchStats();
  };

  // Send Message
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSendResult('');
    try {
      const res = await fetch(`${API}/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendForm),
      });
      const data = await res.json();
      if (data.success) {
        setSendResult('✅ Message sent securely to WhatsApp network');
        setSendForm({ to: '', message: '' });
      } else {
        setSendResult(`❌ Error: ${data.error}`);
      }
    } catch {
      setSendResult('❌ Failed to route message to server');
    }
    setSending(false);
  };

  // Clear Messages
  const clearMessages = async () => {
    if (!confirm('Are you sure you want to purge all message logs? This cannot be undone.')) return;
    await fetch(`${API}/api/messages`, { method: 'DELETE' });
    setMessages([]);
    await fetchStats();
  };

  // Status indicator
  const statusColors: Record<WaStatus, { hex: string, bg: string }> = {
    connected: { hex: '#25D366', bg: '#25D36615' },
    qr: { hex: '#f59e0b', bg: '#f59e0b15' },
    disconnected: { hex: '#ef4444', bg: '#ef444415' },
  };
  const statusTheme = statusColors[waStatus];

  return (
    <div className="min-h-screen flex flex-col font-outfit" style={{ background: 'var(--bg-dark)' }}>
      {/* 🟢 TOP HEADER */}
      <header className="sticky top-0 z-50 px-8 py-5 flex items-center justify-between glass-panel border-x-0 border-t-0 border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-[#25d366] to-[#128c7e] shadow-lg shadow-[#128c7e]/30">
            <MessageCircle size={24} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl text-white tracking-wide">NexBot AI</h1>
            <p className="text-xs text-zinc-400 font-medium tracking-wider uppercase mt-0.5">Neural Auto-Responder</p>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-3 px-5 py-2.5 rounded-2xl border" 
             style={{ borderColor: `${statusTheme.hex}30`, background: statusTheme.bg }}>
          {waStatus === 'connected' ? (
            <div className="w-2.5 h-2.5 rounded-full pulse-green" style={{ background: statusTheme.hex }} />
          ) : (
            <Plug size={14} style={{ color: statusTheme.hex }} />
          )}
          <span className="text-sm font-bold tracking-wide" style={{ color: statusTheme.hex }}>{statusMsg}</span>
        </div>
      </header>

      {/* 🟢 MAIN BODY */}
      <div className="flex flex-1 max-w-[1600px] w-full mx-auto relative">
        
        {/* ── SIDEBAR ── */}
        <aside className="w-72 p-6 flex flex-col gap-3 sticky top-[89px] h-[calc(100vh-89px)] border-r border-white/5">
          {([
            { id: 'dashboard', label: 'Overview', icon: <Activity size={20} /> },
            { id: 'messages', label: 'Network Logs', icon: <MessageCircle size={20} /> },
            { id: 'rules', label: 'Logic Rules', icon: <Settings2 size={20} /> },
            { id: 'send', label: 'Direct Transmission', icon: <Send size={20} /> },
          ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(item => {
            const isActive = tab === item.id;
            return (
              <button key={item.id} onClick={() => setTab(item.id)}
                className={`flex items-center gap-4 px-5 py-4 rounded-2xl text-left font-semibold transition-all duration-300 relative overflow-hidden group ${
                  isActive ? 'text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}>
                {isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-[#25D36620] to-transparent" />
                )}
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#25D366] rounded-r-full" />
                )}
                <span className={`relative z-10 transition-colors ${isActive ? 'text-[#25D366]' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                  {item.icon}
                </span>
                <span className="relative z-10 uppercase tracking-wide text-xs">{item.label}</span>
              </button>
            );
          })}

          {/* QR Code in sidebar when disconnected */}
          {waStatus === 'qr' && qrCode && (
            <div className="mt-8 glass-panel rounded-3xl p-6 text-center animate-fade-in border-[#f59e0b30]">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#f59e0b20] flex items-center justify-center mb-4">
                <PhoneCall size={20} className="text-[#f59e0b]" />
              </div>
              <p className="text-xs font-bold tracking-wider uppercase mb-4 text-[#f59e0b]">Link Device</p>
              <div className="bg-white p-3 rounded-2xl shadow-xl">
                <img src={qrCode} alt="QR Code" className="w-full h-auto rounded-xl" />
              </div>
              <p className="text-[11px] text-zinc-400 mt-4 leading-relaxed">
                Open WhatsApp on your phone, go to Settings &gt; Linked Devices to scan this access node.
              </p>
            </div>
          )}
        </aside>

        {/* ── MAIN CONTENT AREA ── */}
        <main className="flex-1 p-8 overflow-auto">

          {/* ────── DASHBOARD OVERVIEW ────── */}
          {tab === 'dashboard' && (
            <div className="space-y-8 max-w-6xl mx-auto animate-fade-in">
              <div className="flex items-center gap-3 mb-8">
                <div className="h-8 w-2 rounded-full bg-[#25D366]" />
                <h2 className="text-3xl font-bold tracking-tight text-white">System Overview</h2>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard label="Total Handled" value={stats?.totalMessages ?? 0} icon={<BarChart3 size={24} />} color="#25D366" />
                <StatCard label="AI Responses" value={stats?.aiReplies ?? 0} icon={<Bot size={24} />} color="#a855f7" />
                <StatCard label="Rule Invocations" value={stats?.keywordReplies ?? 0} icon={<Zap size={24} />} color="#eab308" />
                <StatCard label="Active Rules" value={stats?.totalRules ?? 0} icon={<KeyRound size={24} />} color="#3b82f6" />
                <StatCard label="Today's Traffic" value={stats?.todayMessages ?? 0} icon={<Calendar size={24} />} color="#ec4899" />
              </div>

              {/* Live Preview Console */}
              <div className="mt-12 glass-panel rounded-3xl overflow-hidden border border-white/5">
                <div className="px-6 py-5 border-b border-white/5 bg-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500/80" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                      <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    </div>
                    <h3 className="ml-2 font-bold text-sm tracking-wide text-zinc-300">LIVE FEED</h3>
                  </div>
                  <button onClick={() => setTab('messages')} className="text-xs font-bold uppercase tracking-wider text-[#25D366] hover:text-white transition-colors">
                    View Logs →
                  </button>
                </div>
                
                <div className="divide-y divide-white/5">
                  {messages.slice(0, 4).map((msg) => (
                    <div key={msg._id} className="p-6 flex items-start gap-5 hover:bg-white/[0.02] transition-colors">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0 bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 text-white shadow-lg">
                        {(msg.contact || msg.from)?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-bold text-white text-base truncate">{msg.contact || msg.from}</span>
                          <Badge type={msg.replyType} />
                          <span className="text-xs ml-auto text-zinc-500 font-medium">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-zinc-400 text-sm truncate pr-4">{msg.body}</p>
                      </div>
                    </div>
                  ))}
                  {messages.length === 0 && (
                    <div className="py-20 text-center flex flex-col items-center justify-center opacity-50">
                      <Activity size={48} className="text-zinc-500 mb-4 opacity-50" />
                      <p className="font-medium text-zinc-400 tracking-wide">Awaiting incoming signals...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ────── MESSAGES TAB ────── */}
          {tab === 'messages' && (
            <div className="space-y-6 max-w-4xl mx-auto animate-fade-in flex flex-col h-[calc(100vh-140px)]">
              <div className="flex items-center justify-between flex-shrink-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-2 rounded-full bg-[#3b82f6]" />
                  <h2 className="text-3xl font-bold tracking-tight text-white">Network Logs</h2>
                  <span className="ml-3 px-3 py-1 rounded-full bg-white/10 text-xs font-bold">{messages.length}</span>
                </div>
                <button onClick={clearMessages}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold tracking-wider uppercase transition-all bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300">
                  <Trash2 size={16} /> Purge Logs
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-4 space-y-6 pb-20 scrollbar-hide">
                {messages.map((msg) => (
                  <div key={msg._id} className="glass-panel p-6 rounded-[2rem] border-white/5 relative group">
                    <div className="flex items-center gap-4 mb-5">
                      <div className="w-12 h-12 rounded-[1rem] flex items-center justify-center text-lg font-bold shadow-lg bg-zinc-800 text-white border border-white/10">
                        {(msg.contact || msg.from)?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-lg text-white">{msg.contact || msg.from}</span>
                          <Badge type={msg.replyType} />
                        </div>
                        <span className="text-xs text-zinc-500 font-medium tracking-wide">
                          {new Date(msg.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                    </div>
                    
                    {/* Chat Bubbles */}
                    <div className="space-y-4 ml-2">
                      {/* Received */}
                      <div className="relative">
                        <div className="absolute top-4 -left-[21px] w-4 h-[1px] bg-white/20" />
                        <div className="bg-zinc-800/80 border border-white/10 px-5 py-4 rounded-2xl rounded-tl-sm text-[15px] leading-relaxed text-zinc-200">
                          <span className="text-[10px] uppercase tracking-wider font-bold block mb-2 text-zinc-500">📥 Inbound Signal</span>
                          {msg.body}
                        </div>
                      </div>
                      
                      {/* Reply */}
                      {msg.reply && (
                        <div className="relative ml-8">
                          <div className="absolute top-4 -left-[29px] w-6 h-[1px]" style={{ background: msg.replyType === 'ai' ? '#8b5cf650' : '#25D36650' }} />
                          <div className="px-5 py-4 rounded-2xl rounded-tr-sm text-[15px] shadow-lg border relative overflow-hidden group-hover:shadow-xl transition-all"
                               style={{ 
                                 background: msg.replyType === 'ai' ? 'linear-gradient(145deg, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0.05) 100%)' : 'linear-gradient(145deg, rgba(37,211,102,0.15) 0%, rgba(37,211,102,0.05) 100%)', 
                                 borderColor: msg.replyType === 'ai' ? 'rgba(139,92,246,0.3)' : 'rgba(37,211,102,0.3)' 
                               }}>
                            <span className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold block mb-2" 
                                  style={{ color: msg.replyType === 'ai' ? '#a78bfa' : '#25D366' }}>
                              📤 {msg.replyType === 'ai' ? 'AI Generated Response' : 'Rule-Based Response'}
                            </span>
                            {/* ReactMarkdown is used here for bold/italic parsing */}
                            <div className="prose prose-invert max-w-none text-zinc-200">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.reply}</ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-50 py-32">
                    <MessageCircle size={64} className="text-zinc-600 mb-6" />
                    <p className="text-xl font-medium text-zinc-400">Database Empty</p>
                  </div>
                )}
                <div ref={msgEndRef} className="h-4" />
              </div>
            </div>
          )}

          {/* ────── RULES TAB ────── */}
          {tab === 'rules' && (
            <div className="space-y-8 max-w-4xl mx-auto animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-2 rounded-full bg-[#f472b6]" />
                <h2 className="text-3xl font-bold tracking-tight text-white">Logic Rules</h2>
              </div>

              {/* Add Rule Form */}
              <div className="glass-panel p-8 rounded-3xl relative overflow-hidden border-t-2 border-t-[#f472b6]/50">
                <div className="absolute top-0 right-[-100px] w-64 h-64 bg-[#f472b6] rounded-full blur-[100px] opacity-10" />
                
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-white">
                  <div className="p-1.5 rounded-lg bg-[#f472b6]/20">
                    <Zap size={18} className="text-[#f472b6]" />
                  </div>
                  Inject New Rule
                </h3>
                
                <form onSubmit={addRule} className="space-y-6 relative z-10">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div className="md:col-span-4">
                      <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-zinc-400 ml-1">Trigger Condition</label>
                      <input value={newRule.keyword} onChange={e => setNewRule(p => ({ ...p, keyword: e.target.value }))}
                        placeholder="e.g. price, menu, help"
                        className="w-full px-5 py-3.5 rounded-2xl text-[15px] outline-none bg-zinc-800/50 border border-white/10 focus:border-[#f472b6] focus:bg-zinc-800 transition-all text-white placeholder-zinc-600" />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-zinc-400 ml-1">Matcher</label>
                      <select value={newRule.matchType} onChange={e => setNewRule(p => ({ ...p, matchType: e.target.value }))}
                        className="w-full px-5 py-3.5 rounded-2xl text-[15px] outline-none bg-zinc-800/50 border border-white/10 focus:border-[#f472b6] focus:bg-zinc-800 transition-all text-white appearance-none cursor-pointer">
                        <option value="contains" className="bg-zinc-900">Contains String</option>
                        <option value="exact" className="bg-zinc-900">Exact Match</option>
                      </select>
                    </div>
                    <div className="md:col-span-5">
                      <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-zinc-400 ml-1">Automated Response</label>
                      <input value={newRule.reply} onChange={e => setNewRule(p => ({ ...p, reply: e.target.value }))}
                        placeholder="Type the exact reply text..."
                        className="w-full px-5 py-3.5 rounded-2xl text-[15px] outline-none bg-zinc-800/50 border border-white/10 focus:border-[#f472b6] focus:bg-zinc-800 transition-all text-white placeholder-zinc-600" />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button type="submit" disabled={ruleLoading}
                      className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm transition-all hover:-translate-y-0.5 shadow-lg bg-[#f472b6] text-black disabled:opacity-50 disabled:hover:translate-y-0">
                      {ruleLoading ? 'Injecting...' : 'Deploy Rule →'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Rules List */}
              <div className="space-y-4">
                <h3 className="font-bold text-sm tracking-widest text-zinc-500 uppercase ml-2 mb-4">Active Logic Protocols</h3>
                {rules.map((rule) => (
                  <div key={rule._id} className="glass-panel p-5 rounded-2xl flex items-center gap-6 transition-all group"
                    style={{ borderColor: rule.isActive ? 'rgba(244,114,182,0.3)' : 'rgba(255,255,255,0.05)', opacity: rule.isActive ? 1 : 0.4 }}>
                    
                    <div className="flex-1 overflow-hidden pl-2">
                      <div className="flex items-center gap-3 mb-2.5">
                        <span className="font-bold text-sm px-4 py-1.5 rounded-full uppercase tracking-wider bg-[#f472b6]/10 text-[#f472b6] border border-[#f472b6]/20 shadow-inner">
                          {rule.keyword}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 border border-white/5">
                          {rule.matchType}
                        </span>
                        <span className="text-[11px] font-bold uppercase text-zinc-500 ml-2">Engagements: {rule.hitCount}</span>
                      </div>
                      <p className="text-[15px] text-zinc-300 ml-1 truncate">↳ {rule.reply}</p>
                    </div>
                    
                    <div className="flex items-center gap-3 pr-2">
                      <button onClick={() => toggleRule(rule._id, rule.isActive)}
                        className={`p-3 rounded-xl transition-all ${rule.isActive ? 'bg-zinc-800/80 text-orange-400 hover:bg-orange-500/20 hover:text-orange-300' : 'bg-zinc-800/80 text-green-400 hover:bg-green-500/20 hover:text-green-300'}`}
                        title={rule.isActive ? "Pause Rule" : "Activate Rule"}>
                        {rule.isActive ? <Pause size={18} /> : <Play size={18} />}
                      </button>
                      <button onClick={() => deleteRule(rule._id)}
                        className="p-3 rounded-xl bg-zinc-800/80 text-red-500 hover:bg-red-500/20 hover:text-red-400 transition-all"
                        title="Delete Rule">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
                {rules.length === 0 && (
                  <div className="py-24 text-center glass-panel rounded-3xl border-dashed">
                    <KeyRound size={48} className="mx-auto text-zinc-600 mb-4 opacity-50" />
                    <p className="text-lg font-medium text-zinc-400">No behavioral rules defined.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ────── SEND TAB ────── */}
          {tab === 'send' && (
            <div className="max-w-3xl mx-auto animate-fade-in mt-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="h-8 w-2 rounded-full bg-[#10b981]" />
                <h2 className="text-3xl font-bold tracking-tight text-white">Direct Transmission</h2>
              </div>
              
              <div className="glass-panel rounded-3xl p-8 relative overflow-hidden border-t-2 border-t-[#10b981]/50 shadow-2xl">
                <div className="absolute top-0 right-0 w-80 h-80 bg-[#10b981] rounded-full blur-[120px] opacity-[0.08]" />
                
                {waStatus !== 'connected' && (
                  <div className="mb-6 px-5 py-4 rounded-2xl text-sm font-bold flex items-center gap-3 bg-red-500/10 text-red-400 border border-red-500/20">
                    <Plug className="shrink-0" size={18} />
                    System is currently disconnected from the WhatsApp network. Transmission failed.
                  </div>
                )}
                
                <form onSubmit={sendMessage} className="space-y-6 relative z-10">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-zinc-400 ml-1">
                      Target Identity (Phone Number)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                        <PhoneCall size={18} className="text-zinc-500" />
                      </div>
                      <input value={sendForm.to} onChange={e => setSendForm(p => ({ ...p, to: e.target.value }))}
                        placeholder="e.g. 919876543210"
                        className="w-full pl-12 pr-5 py-4 rounded-2xl text-base outline-none bg-zinc-800/60 border border-white/10 focus:border-[#10b981] focus:bg-zinc-800 transition-all text-white placeholder-zinc-600 font-medium tracking-wide" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-zinc-400 ml-1">Payload (Message Body)</label>
                    <textarea value={sendForm.message} onChange={e => setSendForm(p => ({ ...p, message: e.target.value }))}
                      placeholder="Enter exact message to transmit..."
                      rows={6}
                      className="w-full px-5 py-4 rounded-2xl text-base outline-none resize-none bg-zinc-800/60 border border-white/10 focus:border-[#10b981] focus:bg-zinc-800 transition-all text-white placeholder-zinc-600" />
                  </div>
                  
                  <div className="pt-4 flex items-center justify-between">
                    <div>
                      {sendResult && (
                        <div className={`text-sm font-bold px-4 py-2 rounded-lg ${sendResult.includes('✅') ? 'bg-[#10b981]/10 text-[#10b981]' : 'bg-red-500/10 text-red-400'}`}>
                          {sendResult}
                        </div>
                      )}
                    </div>
                    <button type="submit" disabled={sending || waStatus !== 'connected' || !sendForm.to || !sendForm.message}
                      className="flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-[15px] transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg disabled:opacity-50 disabled:hover:scale-100"
                      style={{ background: 'linear-gradient(to right, #10b981, #059669)', color: '#fff' }}>
                      {sending ? 'Transmitting...' : (
                        <>
                          <Send size={18} />
                          Execute Launch
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
