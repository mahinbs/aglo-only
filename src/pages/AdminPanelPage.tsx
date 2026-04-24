import { useCallback, useEffect, useState } from "react";
import { bffConfigured, bffFetch, bffMe } from "@/lib/api";

type Pending = { id?: string; approval_status?: string; created_at?: string };

export default function AdminPanelPage() {
  const [role, setRole] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!bffConfigured()) return;
    const me = await bffMe();
    setRole((me?.role as string) ?? null);
    if (me?.role !== "super_admin") return;
    try {
      const r = await bffFetch<{ users?: Pending[] }>("/api/admin/users/pending");
      setPending(r.users ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (id: string) => {
    setMsg(null);
    try {
      await bffFetch(`/api/admin/users/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMsg("Approved");
      void load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Approve failed");
    }
  };

  if (!bffConfigured()) {
    return <p style={{ padding: 24, color: "#94a3b8" }}>BFF not configured.</p>;
  }

  if (role !== "super_admin") {
    return <p style={{ padding: 24, color: "#f43f5e" }}>Super admin only.</p>;
  }

  return (
    <div style={{ padding: 24, background: "#06080d", minHeight: "100vh", color: "#e2e8f0" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Admin — pending users</h1>
      {err && <p style={{ color: "#f43f5e" }}>{err}</p>}
      {msg && <p style={{ color: "#34d399" }}>{msg}</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {pending.map((u) => (
          <li key={u.id} style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
            <code style={{ fontSize: 12 }}>{u.id}</code>
            <button
              type="button"
              style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "#38bdf8", cursor: "pointer" }}
              onClick={() => u.id && void approve(u.id)}
            >
              Approve
            </button>
          </li>
        ))}
      </ul>
      {pending.length === 0 && <p style={{ color: "#64748b" }}>No pending profiles.</p>}
    </div>
  );
}
