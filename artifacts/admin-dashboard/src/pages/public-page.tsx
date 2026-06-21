import { useEffect, useState } from "react";
import { useRoute } from "wouter";

interface LegalContent {
  title: string;
  content: string;
  version: number;
  updatedAt: string | null;
}

const SLUG_MAP: Record<string, string> = {
  "privacy-policy": "privacy-policy",
  "terms-and-conditions": "terms-and-conditions",
};

export default function PublicPage() {
  const [, paramsPrivacy] = useRoute("/privacy-policy");
  const [, paramsTerms] = useRoute("/terms-and-conditions");

  const slug = paramsPrivacy !== null
    ? "privacy-policy"
    : paramsTerms !== null
    ? "terms-and-conditions"
    : null;

  const [data, setData] = useState<LegalContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug || !SLUG_MAP[slug]) {
      setError("Page not found.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/public/legal/${slug}`)
      .then(async (res) => {
        if (!res.ok) {
          setError("This content is not currently available. Please check back later.");
          setData(null);
        } else {
          const json = await res.json();
          setData(json);
        }
      })
      .catch(() => {
        setError("Unable to load content. Please try again later.");
      })
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "#e2e8f0" }}>
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "48px 24px 80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ marginBottom: 40 }}>
          <div
            style={{
              display: "inline-block",
              background: "#06b6d4",
              color: "#0f172a",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: 1.5,
              padding: "4px 12px",
              borderRadius: 4,
              marginBottom: 16,
              textTransform: "uppercase",
            }}
          >
            Tarzi
          </div>
        </div>

        {loading && (
          <div style={{ color: "#94a3b8", fontSize: 16 }}>Loading…</div>
        )}

        {!loading && error && (
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16, color: "#f1f5f9" }}>
              {slug === "privacy-policy" ? "Privacy Policy" : "Terms & Conditions"}
            </h1>
            <div
              style={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: "24px",
                color: "#94a3b8",
                fontSize: 15,
              }}
            >
              {error}
            </div>
            <p style={{ marginTop: 32, fontSize: 13, color: "#64748b" }}>
              For support, contact{" "}
              <a
                href="mailto:support@verbosetechlabs.com"
                style={{ color: "#06b6d4", textDecoration: "none" }}
              >
                support@verbosetechlabs.com
              </a>
            </p>
          </div>
        )}

        {!loading && data && (
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, color: "#f1f5f9" }}>
              {data.title}
            </h1>
            {data.updatedAt && (
              <p style={{ fontSize: 13, color: "#64748b", marginBottom: 40 }}>
                Last updated:{" "}
                {new Date(data.updatedAt).toLocaleDateString("en-IN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                {data.version > 1 && ` · Version ${data.version}`}
              </p>
            )}
            <div
              style={{
                fontSize: 15,
                lineHeight: 1.8,
                color: "#cbd5e1",
                whiteSpace: "pre-wrap",
                background: "#1e293b",
                borderRadius: 8,
                padding: "28px 32px",
                border: "1px solid #334155",
              }}
            >
              {data.content}
            </div>
            <p style={{ marginTop: 40, fontSize: 13, color: "#64748b" }}>
              For questions, contact{" "}
              <a
                href="mailto:support@verbosetechlabs.com"
                style={{ color: "#06b6d4", textDecoration: "none" }}
              >
                support@verbosetechlabs.com
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
