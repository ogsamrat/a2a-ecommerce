"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, MessageSquare } from "lucide-react";
import type { FeedbackSummary, OrderRecord } from "@/lib/agents/types";
import { apiRequest } from "@/lib/api/client";

export function FeedbackPanel({
  buyerAddress,
  order,
  feedback,
  signTransactions,
  onFeedback,
}: {
  buyerAddress: string | null;
  order: OrderRecord | null;
  feedback: FeedbackSummary | null;
  signTransactions: (txns: Uint8Array[]) => Promise<(Uint8Array | null)[]>;
  onFeedback: (next: FeedbackSummary | null) => void;
}) {
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const hasActiveFeedback = useMemo(
    () => Boolean(feedback && !feedback.isUndone),
    [feedback],
  );

  async function submit(publishOnChain: boolean): Promise<void> {
    if (!buyerAddress || !order) return;
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const submitRes = await apiRequest<{
        feedback: FeedbackSummary;
        wasCreated: boolean;
      }>("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress,
          orderTxId: order.orderTxId,
          rating: Number(rating),
          comment,
        }),
      });
      onFeedback(submitRes.feedback);
      setMsg("Feedback saved for marketplace reputation.");

      if (publishOnChain && submitRes.wasCreated) {
        const score = Math.max(
          0,
          Math.min(100, Math.round((Number(rating) / 5) * 100)),
        );
        const repTxn = await apiRequest<{ unsignedTxn: string }>(
          "/api/reputation/feedback",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              senderAddress: buyerAddress,
              agentAddress: order.seller,
              score,
            }),
          },
        );

        const bytes = Uint8Array.from(atob(repTxn.unsignedTxn), (c) =>
          c.charCodeAt(0),
        );
        const signed = (await signTransactions([bytes]))[0];
        if (!signed) throw new Error("Wallet returned empty signature");
        const b64 = btoa(String.fromCharCode(...Array.from(signed)));
        await apiRequest<{ txId: string }>("/api/wallet/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signedTxn: b64 }),
        });
        setMsg("Feedback saved + published to on-chain seller reputation.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit feedback");
    } finally {
      setSaving(false);
    }
  }

  async function undo(): Promise<void> {
    if (!buyerAddress || !order) return;
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const data = await apiRequest<{ feedback: FeedbackSummary }>(
        "/api/feedback/undo",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buyerAddress, orderTxId: order.orderTxId }),
        },
      );
      onFeedback(data.feedback);
      setMsg("Feedback undone for marketplace reputation.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to undo feedback");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="cyber-card terminal-panel" style={{ marginTop: 16 }}>
      <div className="section-head">
        <MessageSquare size={18} />
        <h3>Feedback</h3>
      </div>

      {!order && (
        <p className="status-muted">Load an order to leave feedback.</p>
      )}

      {order && (
        <div className="cyber-form" style={{ gap: 12 }}>
          {feedback && (
            <p className="status-muted">
              Current: {feedback.isUndone ? "Undone" : `${feedback.rating}/5`} •
              Updated {new Date(feedback.updatedAt).toLocaleString()}
            </p>
          )}

          <label>
            <span>RATING (1-5)</span>
            <input
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <label>
            <span>COMMENT (OPTIONAL)</span>
            <textarea
              className="cyber-textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn-neon"
              type="button"
              disabled={!buyerAddress || saving}
              onClick={() => submit(false)}
            >
              {hasActiveFeedback ? "Edit Feedback" : "Submit Feedback"}
            </button>
            <button
              className="btn-outline"
              type="button"
              disabled={!buyerAddress || saving}
              onClick={() => submit(true)}
            >
              Submit + Publish On-Chain
            </button>
            <button
              className="btn-outline"
              type="button"
              disabled={!buyerAddress || saving || !feedback}
              onClick={undo}
            >
              Undo Feedback
            </button>
          </div>

          {msg && (
            <p className="status-good">
              <CheckCircle2 size={14} /> {msg}
            </p>
          )}
          {error && (
            <p className="status-bad">
              <AlertTriangle size={14} /> {error}
            </p>
          )}
          <p className="status-muted">
            Marketplace feedback is editable for 15 minutes, and undo is allowed
            anytime. Publishing to the on-chain reputation contract is
            permanent.
          </p>
        </div>
      )}
    </section>
  );
}
