import { useState, FormEvent } from "react";

type Step = "form" | "submitted";

export default function DeleteAccountPage() {
  const [step, setStep] = useState<Step>("form");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = phone.replace(/\D/g, "").slice(0, 10);
  const isValid = /^[6-9]\d{9}$/.test(digits);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/public/account/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: "+91" + digits,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      if (res.ok) {
        setStep("submitted");
      } else {
        setError("Something went wrong. Please try again later.");
      }
    } catch {
      setError("Unable to submit. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          borderBottom: "1px solid #1e293b",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span
          style={{
            background: "#06b6d4",
            color: "#0f172a",
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: 2,
            padding: "3px 10px",
            borderRadius: 4,
            textTransform: "uppercase",
          }}
        >
          Tarzi
        </span>
        <span style={{ color: "#475569", fontSize: 13 }}>Account Deletion Request</span>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px 80px" }}>
        {step === "submitted" ? (
          <SuccessView />
        ) : (
          <FormView
            digits={digits}
            setPhone={setPhone}
            reason={reason}
            setReason={setReason}
            isValid={isValid}
            submitting={submitting}
            error={error}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}

function FormView({
  digits,
  setPhone,
  reason,
  setReason,
  isValid,
  submitting,
  error,
  onSubmit,
}: {
  digits: string;
  setPhone: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
  isValid: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <div>
      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 12,
          color: "#f1f5f9",
          lineHeight: 1.2,
        }}
      >
        Request Account Deletion
      </h1>
      <p
        style={{
          fontSize: 15,
          color: "#94a3b8",
          lineHeight: 1.7,
          marginBottom: 36,
        }}
      >
        You can request deletion of your Tarzi account and associated data using
        this form. Requests are processed within 30 days. Some data may be
        retained for legal, payment, or fraud-prevention purposes.
      </p>

      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "#cbd5e1",
              marginBottom: 8,
            }}
          >
            Registered Mobile Number{" "}
            <span style={{ color: "#f87171" }}>*</span>
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <span
              style={{
                padding: "12px 14px",
                fontSize: 15,
                color: "#94a3b8",
                borderRight: "1px solid #334155",
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
            >
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={digits}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
              required
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                padding: "12px 14px",
                fontSize: 15,
                color: "#f1f5f9",
                fontFamily: "inherit",
              }}
            />
          </div>
          {digits.length > 0 && !isValid && (
            <p style={{ marginTop: 6, fontSize: 12, color: "#f87171" }}>
              Enter a valid 10-digit Indian mobile number (starts with 6–9).
            </p>
          )}
        </div>

        <div style={{ marginBottom: 32 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 600,
              color: "#cbd5e1",
              marginBottom: 8,
            }}
          >
            Reason{" "}
            <span style={{ color: "#475569", fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Tell us why you want to delete your account..."
            maxLength={500}
            rows={4}
            style={{
              width: "100%",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 8,
              padding: "12px 14px",
              fontSize: 15,
              color: "#f1f5f9",
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <p
            style={{
              marginTop: 4,
              fontSize: 12,
              color: "#475569",
              textAlign: "right",
            }}
          >
            {reason.length}/500
          </p>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 20,
              background: "#450a0a",
              border: "1px solid #7f1d1d",
              borderRadius: 8,
              padding: "12px 16px",
              fontSize: 14,
              color: "#fca5a5",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!isValid || submitting}
          style={{
            width: "100%",
            padding: "14px",
            background: isValid && !submitting ? "#dc2626" : "#1e293b",
            color: isValid && !submitting ? "#fff" : "#475569",
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: isValid && !submitting ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          {submitting ? "Submitting..." : "Submit Deletion Request"}
        </button>
      </form>

      <p style={{ marginTop: 40, fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
        For account or privacy questions, contact{" "}
        <a
          href="mailto:support@verbosetechlabs.com"
          style={{ color: "#06b6d4", textDecoration: "none" }}
        >
          support@verbosetechlabs.com
        </a>
      </p>
    </div>
  );
}

function SuccessView() {
  return (
    <div>
      <div
        style={{
          background: "#0d2d1e",
          border: "1px solid #166534",
          borderRadius: 12,
          padding: "40px 32px",
          textAlign: "center",
          marginBottom: 32,
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16, color: "#4ade80" }}>✓</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#4ade80", marginBottom: 12 }}>
          Request Received
        </h1>
        <p style={{ fontSize: 15, color: "#86efac", lineHeight: 1.7 }}>
          Your account deletion request has been received. If a Tarzi account is
          registered to this number, it will be processed within 30 days.
        </p>
      </div>
      <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7 }}>
        Some data may be retained for legal, payment, fraud-prevention, or
        record-keeping purposes as described in our{" "}
        <a
          href="/privacy-policy"
          style={{ color: "#06b6d4", textDecoration: "none" }}
        >
          Privacy Policy
        </a>
        . For further assistance, contact{" "}
        <a
          href="mailto:support@verbosetechlabs.com"
          style={{ color: "#06b6d4", textDecoration: "none" }}
        >
          support@verbosetechlabs.com
        </a>
        .
      </p>
    </div>
  );
}
