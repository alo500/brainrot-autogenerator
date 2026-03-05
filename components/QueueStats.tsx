"use client";

import useSWR from "swr";
import type { QueueStats } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function QueueStats() {
  const { data } = useSWR<{ stats: QueueStats; wanOnline: boolean }>(
    "/api/queue",
    fetcher,
    { refreshInterval: 5000 }
  );

  const stats = data?.stats;
  const wanOnline = data?.wanOnline;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[
        { label: "Queued", value: stats?.queued ?? "—", color: "text-yellow-400" },
        { label: "Processing", value: stats?.processing ?? "—", color: "text-blue-400" },
        { label: "Completed", value: stats?.completed ?? "—", color: "text-green-400" },
        { label: "Failed", value: stats?.failed ?? "—", color: "text-red-400" },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className={`text-2xl font-bold ${color}`}>{value}</div>
          <div className="text-xs text-zinc-500 mt-1">{label}</div>
        </div>
      ))}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              wanOnline ? "bg-green-400 animate-pulse" : "bg-zinc-600"
            }`}
          />
          <span className="text-sm text-zinc-300">Local Wan2.1</span>
        </div>
        <div className="text-xs text-zinc-500 mt-1">
          {wanOnline === undefined ? "checking..." : wanOnline ? "online" : "offline"}
        </div>
      </div>
    </div>
  );
}
