"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ─── Channel presets ──────────────────────────────────────────────────────────

interface Channel {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  defaultVoice: string;
  topicHints: string[];
  systemNote: string;
}

const CHANNELS: Channel[] = [
  {
    id: "scp",
    name: "SCP Archives",
    description: "Classified anomaly files. AI-generated SCP entity encounters.",
    icon: "⬛",
    color: "#ef4444",
    defaultVoice: "en-US-GuyNeural",
    topicHints: [
      "SCP-096: The Shy Guy escapes containment",
      "SCP-3008: Infinite IKEA survivor testimony",
      "SCP-049: The Plague Doctor's latest experiment",
      "SCP-173: New security footage analysis",
      "SCP-999: The Tickle Monster saves a researcher",
      "SCP-682: Another failed termination attempt",
      "New SCP discovered in abandoned subway system",
      "Class D personnel logs: Day 47 inside SCP-3008",
    ],
    systemNote:
      "Generate content in the style of SCP Foundation classified documents. Use clinical, bureaucratic language mixed with horror. Reference containment classes (Safe, Euclid, Keter, Thaumiel). Include redacted [DATA EXPUNGED] sections. The tone should be unsettling documentary narration.",
  },
  {
    id: "love-island",
    name: "AI Love Island",
    description: "Dramatic AI-generated reality dating show episodes.",
    icon: "🏝",
    color: "#ec4899",
    defaultVoice: "en-GB-SoniaNeural",
    topicHints: [
      "New bombshell enters the villa",
      "Recoupling ceremony goes wrong",
      "Secret kiss exposed at the fire pit",
      "Lie detector challenge destroys couple",
      "Casa Amor betrayal revealed",
      "Final couple vote — who wins?",
    ],
    systemNote:
      "Generate in the style of a British reality dating show. Dramatic narrator, gossip, love triangles, betrayal. Characters should have distinct personalities. Include confessional-style moments.",
  },
  {
    id: "conspiracy",
    name: "Deep Lore",
    description: "Conspiracy theories, unsolved mysteries, and rabbit holes.",
    icon: "👁",
    color: "#8b5cf6",
    defaultVoice: "en-US-GuyNeural",
    topicHints: [
      "The real reason the internet went down in 2024",
      "What NASA found on the dark side of the moon",
      "The AI that was shut down for knowing too much",
      "Missing flight theories that actually make sense",
      "Underground cities that governments deny exist",
    ],
    systemNote:
      "Conspiracy/mystery narration style. Build suspense, present evidence, ask rhetorical questions. Use dramatic pacing. Never claim things are true — present as theories and let the viewer decide.",
  },
  {
    id: "history",
    name: "History Unhinged",
    description: "Wild true stories from history, told with modern energy.",
    icon: "⚔",
    color: "#f59e0b",
    defaultVoice: "en-US-AndrewNeural",
    topicHints: [
      "The time a bear became a corporal in WWII",
      "Ancient Rome's most unhinged emperor",
      "The medieval peasant who outsmarted a king",
      "History's greatest heist nobody talks about",
      "The accidental invention that changed everything",
    ],
    systemNote:
      "Tell true historical stories with modern, engaging energy. Use humor and dramatic storytelling. Keep facts accurate but delivery entertaining. Think 'Oversimplified' or 'Sam O'Nella' style.",
  },
  {
    id: "custom",
    name: "Custom",
    description: "Your own channel — any topic, any style.",
    icon: "✦",
    color: "#71717a",
    defaultVoice: "en-US-GuyNeural",
    topicHints: [],
    systemNote: "",
  },
];

// ─── Voice options ────────────────────────────────────────────────────────────

const VOICES = [
  { id: "en-US-GuyNeural", label: "Guy (US)", gender: "M" },
  { id: "en-US-AndrewNeural", label: "Andrew (US)", gender: "M" },
  { id: "en-US-AndrewMultilingualNeural", label: "Andrew Multi", gender: "M" },
  { id: "en-US-JennyNeural", label: "Jenny (US)", gender: "F" },
  { id: "en-US-AriaNeural", label: "Aria (US)", gender: "F" },
  { id: "en-GB-SoniaNeural", label: "Sonia (UK)", gender: "F" },
  { id: "en-GB-RyanNeural", label: "Ryan (UK)", gender: "M" },
  { id: "en-AU-NatashaNeural", label: "Natasha (AU)", gender: "F" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "generate" | "library" | "batch" | "series" | "queue" | "settings";

interface LogEntry {
  type: "status" | "log" | "done" | "error";
  message: string;
  time: string;
}

interface LocalVideo {
  id: string;
  channel: string;
  topic: string;
  videoPath: string;
  scriptPath: string | null;
  thumbnailPath: string | null;
  createdAt: string;
  fileSize: number;
}

interface QueueJob {
  id: string;
  topic: string;
  channel: string;
  status: "pending" | "running" | "done" | "error";
  startedAt?: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Sidebar nav items ───────────────────────────────────────────────────────

const NAV_SECTIONS = [
  {
    label: "Create",
    items: [
      { id: "generate" as View, icon: "▸", label: "Generate" },
      { id: "batch" as View, icon: "≡", label: "Batch" },
      { id: "series" as View, icon: "◇", label: "Series" },
    ],
  },
  {
    label: "Manage",
    items: [
      { id: "library" as View, icon: "◻", label: "Library" },
      { id: "queue" as View, icon: "↻", label: "Queue" },
    ],
  },
  {
    label: "System",
    items: [{ id: "settings" as View, icon: "⚙", label: "Settings" }],
  },
];

// ─── App ──────────────────────────────────────────────────────────────────────

export default function Studio() {
  const [view, setView] = useState<View>("generate");
  const [channel, setChannel] = useState<Channel>(CHANNELS[0]);
  const [topic, setTopic] = useState("");
  const [voice, setVoice] = useState(CHANNELS[0].defaultVoice);
  const [generating, setGenerating] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [videos, setVideos] = useState<LocalVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
  const [scriptData, setScriptData] = useState<Record<string, any>>({});

  // Batch state
  const [batchText, setBatchText] = useState("");
  const [batchJobs, setBatchJobs] = useState<QueueJob[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);

  // Series state
  const [seriesTitle, setSeriesTitle] = useState("");
  const [seriesGenre, setSeriesGenre] = useState("horror");
  const [seriesEpisodes, setSeriesEpisodes] = useState("5");

  // Settings state
  const [settingsModel, setSettingsModel] = useState("llama3");
  const [settingsOllamaUrl, setSettingsOllamaUrl] = useState("http://localhost:11434");
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "online" | "offline">("checking");

  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Load videos
  const loadVideos = useCallback(async () => {
    setLoadingVideos(true);
    try {
      const res = await fetch("/api/local/videos");
      if (res.ok) setVideos(await res.json());
    } catch {}
    setLoadingVideos(false);
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // Check Ollama status
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${settingsOllamaUrl}/api/tags`, {
          signal: AbortSignal.timeout(3000),
        });
        setOllamaStatus(res.ok ? "online" : "offline");
      } catch {
        setOllamaStatus("offline");
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [settingsOllamaUrl]);

  // Load script data for a video
  const loadScript = useCallback(async (videoId: string, scriptPath: string) => {
    if (scriptData[videoId]) return;
    try {
      const res = await fetch(scriptPath);
      if (res.ok) {
        const data = await res.json();
        setScriptData((prev) => ({ ...prev, [videoId]: data }));
      }
    } catch {}
  }, [scriptData]);

  // Generate single video
  const generate = useCallback(async () => {
    if (!topic.trim() || generating) return;
    setGenerating(true);
    setShowTerminal(true);
    setLogs([]);

    const now = () => new Date().toLocaleTimeString("en-US", { hour12: false });

    try {
      const res = await fetch("/api/local/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: channel.systemNote
            ? `[${channel.name} style] ${topic}. ${channel.systemNote}`
            : topic,
          voice,
          channel: channel.id === "custom" ? undefined : channel.id,
        }),
      });

      if (!res.ok || !res.body) {
        setLogs((prev) => [
          ...prev,
          { type: "error", message: "Failed to start pipeline", time: now() },
        ]);
        setGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            setLogs((prev) => [
              ...prev,
              { type: data.type, message: data.message, time: now() },
            ]);
          } catch {}
        }
      }
      setTimeout(loadVideos, 1000);
    } catch {
      setLogs((prev) => [
        ...prev,
        { type: "error", message: "Connection lost", time: now() },
      ]);
    }
    setGenerating(false);
  }, [topic, generating, channel, voice, loadVideos]);

  // Batch generation
  const runBatch = useCallback(async () => {
    const topics = batchText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (topics.length === 0 || batchRunning) return;

    setBatchRunning(true);
    const jobs: QueueJob[] = topics.map((t, i) => ({
      id: `batch-${Date.now()}-${i}`,
      topic: t,
      channel: channel.id,
      status: "pending" as const,
    }));
    setBatchJobs(jobs);

    for (let i = 0; i < jobs.length; i++) {
      setBatchJobs((prev) =>
        prev.map((j, idx) =>
          idx === i ? { ...j, status: "running", startedAt: new Date().toISOString() } : j
        )
      );

      try {
        const res = await fetch("/api/local/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: channel.systemNote
              ? `[${channel.name} style] ${jobs[i].topic}. ${channel.systemNote}`
              : jobs[i].topic,
            voice,
            channel: channel.id === "custom" ? undefined : channel.id,
          }),
        });

        if (!res.ok || !res.body) {
          setBatchJobs((prev) =>
            prev.map((j, idx) =>
              idx === i ? { ...j, status: "error", error: "Failed to start" } : j
            )
          );
          continue;
        }

        // Consume stream to completion
        const reader = res.body.getReader();
        let lastMessage = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = new TextDecoder().decode(value);
          for (const line of text.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const d = JSON.parse(line.slice(6));
                lastMessage = d.message;
                if (d.type === "error") throw new Error(d.message);
              } catch (e) {
                if (e instanceof Error && e.message !== lastMessage) throw e;
              }
            }
          }
        }

        setBatchJobs((prev) =>
          prev.map((j, idx) => (idx === i ? { ...j, status: "done" } : j))
        );
      } catch (e) {
        setBatchJobs((prev) =>
          prev.map((j, idx) =>
            idx === i
              ? { ...j, status: "error", error: e instanceof Error ? e.message : "Unknown error" }
              : j
          )
        );
      }
    }

    setBatchRunning(false);
    loadVideos();
  }, [batchText, batchRunning, channel, voice, loadVideos]);

  // Channel video filter
  const filterVideos = (ch?: string) =>
    ch && ch !== "custom"
      ? videos.filter((v) => v.channel === ch)
      : videos;

  const channelVideos = filterVideos(channel.id);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 border-r border-zinc-800/50 bg-zinc-950 flex flex-col">
        <div className="p-4 pb-2">
          <h1 className="text-sm font-bold tracking-tight">
            brainrot<span className="text-violet-400">.</span>studio
          </h1>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                ollamaStatus === "online"
                  ? "bg-emerald-400"
                  : ollamaStatus === "offline"
                    ? "bg-red-400"
                    : "bg-zinc-600 animate-pulse"
              }`}
            />
            <span className="text-[10px] text-zinc-600">
              {ollamaStatus === "online"
                ? "ollama online"
                : ollamaStatus === "offline"
                  ? "ollama offline"
                  : "checking..."}
            </span>
          </div>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 px-2 py-2 space-y-4 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="text-[10px] text-zinc-600 uppercase tracking-widest px-2 mb-1.5">
                {section.label}
              </div>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2.5 transition-all ${
                    view === item.id
                      ? "bg-zinc-800/80 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
                  }`}
                >
                  <span className="text-[11px] w-4 text-center opacity-60">{item.icon}</span>
                  {item.label}
                  {item.id === "queue" && batchJobs.filter((j) => j.status === "running").length > 0 && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  )}
                  {item.id === "library" && videos.length > 0 && (
                    <span className="ml-auto text-[10px] text-zinc-700">{videos.length}</span>
                  )}
                </button>
              ))}
            </div>
          ))}

          {/* Channel picker (shown when on Generate view) */}
          {view === "generate" && (
            <div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-widest px-2 mb-1.5">
                Channel
              </div>
              {CHANNELS.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => {
                    setChannel(ch);
                    setVoice(ch.defaultVoice);
                    setTopic("");
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition-all ${
                    channel.id === ch.id
                      ? "bg-zinc-800/80 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
                  }`}
                >
                  <span className="text-[11px]">{ch.icon}</span>
                  {ch.name}
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Footer stats */}
        <div className="p-4 border-t border-zinc-800/50">
          <div className="text-[10px] text-zinc-700 space-y-1">
            <p>{videos.length} videos · {formatBytes(videos.reduce((s, v) => s + v.fileSize, 0))}</p>
          </div>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* ═══ GENERATE VIEW ═══ */}
        {view === "generate" && (
          <>
            {/* Header + input */}
            <div className="border-b border-zinc-800/50 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{channel.icon}</span>
                    <h2 className="text-lg font-bold" style={{ color: channel.color }}>
                      {channel.name}
                    </h2>
                  </div>
                  <p className="text-xs text-zinc-500">{channel.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded text-[10px] text-zinc-400 px-2 py-1.5 outline-none"
                  >
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  {showTerminal && (
                    <button
                      onClick={() => setShowTerminal(false)}
                      className="text-[10px] text-zinc-600 hover:text-zinc-400"
                    >
                      hide log
                    </button>
                  )}
                </div>
              </div>

              {/* Topic hints */}
              {channel.topicHints.length > 0 && !topic && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {channel.topicHints.map((hint) => (
                    <button
                      key={hint}
                      onClick={() => {
                        setTopic(hint);
                        inputRef.current?.focus();
                      }}
                      className="text-[10px] px-2.5 py-1.5 border border-zinc-800 rounded text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && generate()}
                  placeholder={generating ? "Generating..." : `Describe your ${channel.name} video...`}
                  disabled={generating}
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm outline-none focus:border-zinc-600 transition-colors placeholder:text-zinc-700 disabled:opacity-50"
                />
                <button
                  onClick={generate}
                  disabled={generating || !topic.trim()}
                  className="px-6 py-3 rounded-lg text-sm font-medium transition-all disabled:opacity-30"
                  style={{
                    backgroundColor: generating ? "#27272a" : channel.color,
                    color: generating ? "#71717a" : "#000",
                  }}
                >
                  {generating ? "Running..." : "Generate"}
                </button>
              </div>
            </div>

            {/* Terminal */}
            {showTerminal && (
              <div className="border-b border-zinc-800/50 bg-zinc-950">
                <div
                  ref={terminalRef}
                  className="h-48 overflow-y-auto p-4 font-mono text-xs space-y-0.5"
                >
                  {logs.length === 0 && (
                    <p className="text-zinc-700">Waiting for pipeline output...</p>
                  )}
                  {logs.map((log, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 ${
                        log.type === "error"
                          ? "text-red-400"
                          : log.type === "done"
                            ? "text-emerald-400"
                            : log.type === "status"
                              ? "text-violet-400"
                              : "text-zinc-500"
                      }`}
                    >
                      <span className="text-zinc-700 shrink-0">{log.time}</span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))}
                  {generating && <div className="text-zinc-600 animate-pulse">▌</div>}
                </div>
              </div>
            )}

            {/* Channel videos */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs text-zinc-600 uppercase tracking-widest">
                  {channel.id === "custom" ? "All Videos" : channel.name} · {channelVideos.length} videos
                </h3>
                <button onClick={loadVideos} className="text-[10px] text-zinc-700 hover:text-zinc-400">
                  refresh
                </button>
              </div>

              {!loadingVideos && channelVideos.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-zinc-600 text-sm mb-2">No videos yet for {channel.name}</p>
                  <p className="text-zinc-700 text-xs">Type a topic above and hit Generate.</p>
                </div>
              )}

              <VideoGrid
                videos={channelVideos}
                playingId={playingId}
                setPlayingId={setPlayingId}
                expandedScript={expandedScript}
                setExpandedScript={setExpandedScript}
                scriptData={scriptData}
                loadScript={loadScript}
              />
            </div>
          </>
        )}

        {/* ═══ LIBRARY VIEW ═══ */}
        {view === "library" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold">Library</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {videos.length} videos · {formatBytes(videos.reduce((s, v) => s + v.fileSize, 0))}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={loadVideos} className="text-[10px] text-zinc-700 hover:text-zinc-400">
                  refresh
                </button>
              </div>
            </div>

            {/* Channel filter pills */}
            <div className="flex gap-2 mb-5">
              {["all", ...CHANNELS.filter((c) => c.id !== "custom").map((c) => c.id)].map((id) => {
                const ch = CHANNELS.find((c) => c.id === id);
                const count = id === "all" ? videos.length : videos.filter((v) => v.channel === id).length;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      // Use channel state to filter library
                      if (id === "all") setChannel(CHANNELS.find((c) => c.id === "custom")!);
                      else setChannel(CHANNELS.find((c) => c.id === id)!);
                    }}
                    className={`text-[10px] px-3 py-1.5 rounded border transition-colors ${
                      (id === "all" && channel.id === "custom") || channel.id === id
                        ? "border-zinc-600 text-zinc-300"
                        : "border-zinc-800 text-zinc-600 hover:border-zinc-700"
                    }`}
                  >
                    {ch?.icon || "◻"} {id === "all" ? "All" : ch?.name} ({count})
                  </button>
                );
              })}
            </div>

            <VideoGrid
              videos={channel.id === "custom" ? videos : videos.filter((v) => v.channel === channel.id)}
              playingId={playingId}
              setPlayingId={setPlayingId}
              expandedScript={expandedScript}
              setExpandedScript={setExpandedScript}
              scriptData={scriptData}
              loadScript={loadScript}
            />
          </div>
        )}

        {/* ═══ BATCH VIEW ═══ */}
        {view === "batch" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <h2 className="text-lg font-bold">Batch Generate</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                One topic per line. Generates sequentially using the selected channel.
              </p>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <select
                value={channel.id}
                onChange={(e) => {
                  const ch = CHANNELS.find((c) => c.id === e.target.value)!;
                  setChannel(ch);
                  setVoice(ch.defaultVoice);
                }}
                className="bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-400 px-3 py-2 outline-none"
              >
                {CHANNELS.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.icon} {ch.name}
                  </option>
                ))}
              </select>
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-400 px-3 py-2 outline-none"
              >
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={`SCP-096: The Shy Guy escapes containment\nSCP-3008: Infinite IKEA survivor logs\nSCP-049: Plague Doctor interview transcript\n...`}
              rows={8}
              disabled={batchRunning}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm font-mono outline-none focus:border-zinc-600 transition-colors placeholder:text-zinc-700 disabled:opacity-50 resize-none mb-4"
            />

            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={runBatch}
                disabled={batchRunning || !batchText.trim()}
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-violet-500 text-black hover:bg-violet-400 transition-colors disabled:opacity-30"
              >
                {batchRunning
                  ? `Running ${batchJobs.filter((j) => j.status === "done").length}/${batchJobs.length}...`
                  : `Generate ${batchText.split("\n").filter((l) => l.trim()).length} videos`}
              </button>
              {batchJobs.length > 0 && !batchRunning && (
                <button
                  onClick={() => setBatchJobs([])}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400"
                >
                  clear
                </button>
              )}
            </div>

            {/* Batch job list */}
            {batchJobs.length > 0 && (
              <div className="space-y-1">
                {batchJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center gap-3 px-3 py-2 rounded bg-zinc-900/50 text-xs"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        job.status === "done"
                          ? "bg-emerald-400"
                          : job.status === "running"
                            ? "bg-violet-400 animate-pulse"
                            : job.status === "error"
                              ? "bg-red-400"
                              : "bg-zinc-700"
                      }`}
                    />
                    <span className={job.status === "done" ? "text-zinc-500 line-through" : "text-zinc-300"}>
                      {job.topic}
                    </span>
                    {job.error && <span className="ml-auto text-red-400 text-[10px]">{job.error}</span>}
                    {job.status === "done" && <span className="ml-auto text-emerald-400/50 text-[10px]">done</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ SERIES VIEW ═══ */}
        {view === "series" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <h2 className="text-lg font-bold">Series Studio</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Multi-episode arcs with character persistence and narrative continuity.
              </p>
            </div>

            <div className="max-w-lg space-y-4">
              <div>
                <label className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1.5">
                  Series Title
                </label>
                <input
                  type="text"
                  value={seriesTitle}
                  onChange={(e) => setSeriesTitle(e.target.value)}
                  placeholder="AI Love Island Season 2"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-zinc-600 placeholder:text-zinc-700"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1.5">
                    Genre
                  </label>
                  <select
                    value={seriesGenre}
                    onChange={(e) => setSeriesGenre(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm outline-none"
                  >
                    {["horror", "drama", "comedy", "mystery", "sci-fi", "romance", "thriller"].map(
                      (g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div className="w-28">
                  <label className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1.5">
                    Episodes
                  </label>
                  <input
                    type="number"
                    value={seriesEpisodes}
                    onChange={(e) => setSeriesEpisodes(e.target.value)}
                    min={1}
                    max={50}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1.5">
                  Channel
                </label>
                <select
                  value={channel.id}
                  onChange={(e) => setChannel(CHANNELS.find((c) => c.id === e.target.value)!)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm outline-none"
                >
                  {CHANNELS.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.icon} {ch.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                disabled={!seriesTitle.trim()}
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-violet-500 text-black hover:bg-violet-400 transition-colors disabled:opacity-30"
              >
                Initialize Series
              </button>
              <p className="text-[10px] text-zinc-700">
                Uses series_local.py to create a series bible with persistent characters, story arcs,
                and episode-to-episode continuity. Each episode auto-generates as a video.
              </p>
            </div>
          </div>
        )}

        {/* ═══ QUEUE VIEW ═══ */}
        {view === "queue" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <h2 className="text-lg font-bold">Queue</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Active and recent generation jobs.</p>
            </div>

            {batchJobs.length === 0 && !generating && (
              <div className="text-center py-16">
                <p className="text-zinc-600 text-sm mb-2">No active jobs</p>
                <p className="text-zinc-700 text-xs">
                  Generate a video or run a batch to see jobs here.
                </p>
              </div>
            )}

            {generating && (
              <div className="px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800/50 mb-4">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  <span className="text-sm text-zinc-300">Generating: {topic}</span>
                </div>
                {logs.length > 0 && (
                  <p className="text-[10px] text-zinc-600 mt-1.5 ml-5 font-mono">
                    {logs[logs.length - 1].message}
                  </p>
                )}
              </div>
            )}

            {batchJobs.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs text-zinc-600 uppercase tracking-widest">
                    Batch — {batchJobs.filter((j) => j.status === "done").length}/{batchJobs.length} complete
                  </h3>
                  {!batchRunning && (
                    <button
                      onClick={() => setBatchJobs([])}
                      className="text-[10px] text-zinc-700 hover:text-zinc-400"
                    >
                      clear
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {batchJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded bg-zinc-900/50 text-xs"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          job.status === "done"
                            ? "bg-emerald-400"
                            : job.status === "running"
                              ? "bg-violet-400 animate-pulse"
                              : job.status === "error"
                                ? "bg-red-400"
                                : "bg-zinc-700"
                        }`}
                      />
                      <span className="text-zinc-400 capitalize w-16 shrink-0">{job.status}</span>
                      <span className="text-zinc-300 truncate">{job.topic}</span>
                      {job.error && <span className="ml-auto text-red-400 text-[10px] shrink-0">{job.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ SETTINGS VIEW ═══ */}
        {view === "settings" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <h2 className="text-lg font-bold">Settings</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Pipeline configuration.</p>
            </div>

            <div className="max-w-lg space-y-6">
              {/* Ollama */}
              <div className="border border-zinc-800/50 rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium">Ollama</h3>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded ${
                      ollamaStatus === "online"
                        ? "bg-emerald-400/10 text-emerald-400"
                        : "bg-red-400/10 text-red-400"
                    }`}
                  >
                    {ollamaStatus}
                  </span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1">
                      Server URL
                    </label>
                    <input
                      type="text"
                      value={settingsOllamaUrl}
                      onChange={(e) => setSettingsOllamaUrl(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs font-mono outline-none focus:border-zinc-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1">
                      Model
                    </label>
                    <input
                      type="text"
                      value={settingsModel}
                      onChange={(e) => setSettingsModel(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs font-mono outline-none focus:border-zinc-600"
                    />
                  </div>
                </div>
              </div>

              {/* TTS */}
              <div className="border border-zinc-800/50 rounded-lg p-5">
                <h3 className="text-sm font-medium mb-4">Text-to-Speech</h3>
                <div>
                  <label className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1">
                    Default Voice
                  </label>
                  <select
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs outline-none"
                  >
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} ({v.gender})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-zinc-700 mt-1.5">
                    Uses edge-tts (free, no API key). Voice is overridden per-channel.
                  </p>
                </div>
              </div>

              {/* Image gen */}
              <div className="border border-zinc-800/50 rounded-lg p-5">
                <h3 className="text-sm font-medium mb-4">Image Generation</h3>
                <div className="space-y-2 text-xs text-zinc-500">
                  <div className="flex items-center justify-between">
                    <span>Model</span>
                    <span className="font-mono text-zinc-400">SDXL Base 1.0</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Resolution</span>
                    <span className="font-mono text-zinc-400">768 x 1344 (9:16)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Steps</span>
                    <span className="font-mono text-zinc-400">25</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Guidance</span>
                    <span className="font-mono text-zinc-400">7.5</span>
                  </div>
                </div>
              </div>

              {/* Paths */}
              <div className="border border-zinc-800/50 rounded-lg p-5">
                <h3 className="text-sm font-medium mb-4">Paths</h3>
                <div className="space-y-2 text-xs text-zinc-500">
                  <div className="flex items-center justify-between gap-4">
                    <span className="shrink-0">Output</span>
                    <span className="font-mono text-zinc-600 truncate">pipeline/output/</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="shrink-0">Series</span>
                    <span className="font-mono text-zinc-600 truncate">pipeline/series/</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="shrink-0">Pipeline</span>
                    <span className="font-mono text-zinc-600 truncate">pipeline/generator_local.py</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Video Grid Component ─────────────────────────────────────────────────────

function VideoGrid({
  videos,
  playingId,
  setPlayingId,
  expandedScript,
  setExpandedScript,
  scriptData,
  loadScript,
}: {
  videos: LocalVideo[];
  playingId: string | null;
  setPlayingId: (id: string | null) => void;
  expandedScript: string | null;
  setExpandedScript: (id: string | null) => void;
  scriptData: Record<string, any>;
  loadScript: (id: string, path: string) => void;
}) {
  if (videos.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {videos.map((video) => (
        <div
          key={video.id}
          className="group relative bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800/50 hover:border-zinc-700 transition-colors"
        >
          <div className="aspect-[9/16] bg-zinc-900 relative">
            {playingId === video.id ? (
              <video
                src={video.videoPath}
                controls
                autoPlay
                className="absolute inset-0 w-full h-full object-cover"
                onEnded={() => setPlayingId(null)}
              />
            ) : (
              <button
                onClick={() => setPlayingId(video.id)}
                className="absolute inset-0 w-full h-full flex items-center justify-center bg-zinc-900 hover:bg-zinc-800/80 transition-colors"
              >
                {video.thumbnailPath && (
                  <img
                    src={video.thumbnailPath}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-60"
                  />
                )}
                <span className="relative text-2xl text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  ▶
                </span>
              </button>
            )}
          </div>

          <div className="p-3">
            <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">{video.topic}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-zinc-600">{timeAgo(video.createdAt)}</span>
              <span className="text-[10px] text-zinc-700">{formatBytes(video.fileSize)}</span>
              {video.channel && (
                <span className="text-[10px] text-zinc-700 ml-auto">{video.channel}</span>
              )}
            </div>
            {video.scriptPath && (
              <button
                onClick={() => {
                  if (expandedScript === video.id) {
                    setExpandedScript(null);
                  } else {
                    setExpandedScript(video.id);
                    loadScript(video.id, video.scriptPath!);
                  }
                }}
                className="text-[10px] text-zinc-600 hover:text-zinc-400 mt-1.5"
              >
                {expandedScript === video.id ? "hide script" : "view script"}
              </button>
            )}
            {expandedScript === video.id && scriptData[video.id] && (
              <pre className="text-[9px] text-zinc-600 mt-2 max-h-32 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
                {JSON.stringify(scriptData[video.id], null, 2)}
              </pre>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
