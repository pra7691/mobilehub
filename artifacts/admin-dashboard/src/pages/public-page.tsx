import { useEffect, useState } from "react";
import { useLocation } from "wouter";

interface LegalContent {
  title: string;
  content: string;
  version: number;
  updatedAt: string | null;
  available?: boolean;
}

const PAGE_META: Record<string, { label: string; slug: string }> = {
  "/privacy-policy":       { label: "Privacy Policy",       slug: "privacy-policy" },
  "/terms-and-conditions": { label: "Terms & Conditions",   slug: "terms-and-conditions" },
};

export default function PublicPage() {
  const [location] = useLocation();
  const meta = PAGE_META[location] ?? null;

  const [data, setData]       = useState<LegalContent | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!meta) {
      setError("Page not found.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/public/legal/${meta.slug}`)
      .then(async (res) => {
        const json: LegalContent = await res.json();
        if (!res.ok || json.available === false) {
          setError(`${meta.label} is currently unavailable.`);
        } else {
          setData(json);
        }
      })
      .catch(() => {
        setError("Unable to load content. Please try again later.");
      })
      .finally(() => setLoading(false));
  }, [location, meta?.slug]);

  const pageLabel = meta?.label ?? "Legal";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f172a",
      color: "#e2e8f0",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Header bar */}
      <div style={{
        borderBottom: "1px solid #1e293b",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <span style={{
          background: "#06b6d4",
          color: "#0f172a",
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: 2,
          padding: "3px 10px",
          borderRadius: 4,
          textTransform: "uppercase",
        }}>
          Tarzi
        </span>
        <span style={{ color: "#475569", fontSize: 13 }}>{pageLabel}</span>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: 780,
        margin: "0 auto",
        padding: "48px 24px 80px",
      }}>

        {loading && (
          <div style={{ color: "#64748b", fontSize: 15, textAlign: "center", paddingTop: 60 }}>
            Loading…
          </div>
        )}

        {!loading && error && (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24, color: "#f1f5f9" }}>
              {pageLabel}
            </h1>
            <div style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 10,
              padding: "28px 32px",
              color: "#94a3b8",
              fontSize: 15,
              lineHeight: 1.7,
            }}>
              {error}
            </div>
            <SupportLine />
          </>
        )}

        {!loading && data && (
          <>
            <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, color: "#f1f5f9", lineHeight: 1.2 }}>
              {data.title}
            </h1>

            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 40, display: "flex", gap: 12, flexWrap: "wrap" as const }}>
              {data.updatedAt && (
                <span>
                  Last updated:{" "}
                  {new Date(data.updatedAt).toLocaleDateString("en-IN", {
                    year: "numeric", month: "long", day: "numeric",
                  })}
                </span>
              )}
              {data.version > 1 && <span>Version {data.version}</span>}
            </p>

            <div style={{
              fontSize: 15,
              lineHeight: 1.9,
              color: "#cbd5e1",
              whiteSpace: "pre-wrap",
              background: "#1e293b",
              borderRadius: 10,
              padding: "32px 36px",
              border: "1px solid #334155",
              wordBreak: "break-word",
            }}>
              {data.content}
            </div>

            <SupportLine />
          </>
        )}
      </div>
    </div>
  );
}

function SupportLine() {
  return (
    <p style={{ marginTop: 48, fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
      Questions? Contact{" "}
      <a
        href="mailto:support@verbosetechlabs.com"
        style={{ color: "#06b6d4", textDecoration: "none" }}
      >
        support@verbosetechlabs.com
      </a>
    </p>
  );
}
