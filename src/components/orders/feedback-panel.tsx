"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, MessageSquare } from "lucide-react";
import type { FeedbackSummary, OrderRecord } from "@/lib/agents/types";
import { apiRequest } from "@/lib/api/client";

function isWalletCancelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("cancel") ||
    normalized.includes("reject") ||
    normalized.includes("declin") ||
    normalized.includes("empty signature")
  );
}

function isWalletPromptTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.toLowerCase().includes("wallet signature request timed out");
}

function isOnChainLogicReject(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("logic eval error") ||
    normalized.includes("err opcode executed") ||
    normalized.includes("transactionpool.remember")
  );
}

async function signWithTimeout(
  signTransactions: (txns: Uint8Array[]) => Promise<(Uint8Array | null)[]>,
  txns: Uint8Array[],
  timeoutMs = 45000,
): Promise<(Uint8Array | null)[]> {
  return await Promise.race([
    signTransactions(txns),
    new Promise<(Uint8Array | null)[]>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Wallet signature request timed out"));
      }, timeoutMs);
    }),
  ]);
}

export function FeedbackPanel({
  buyerAddress,
  order,
  feedback,
  signTransactions,
  onFeedback,
  loading,
}: {
  buyerAddress: string | null;
  order: OrderRecord | null;
  feedback: FeedbackSummary | null;
  signTransactions: (txns: Uint8Array[]) => Promise<(Uint8Array | null)[]>;
  onFeedback: (next: FeedbackSummary | null) => void;
  loading?: boolean;
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

  const canPublishOnChain = Boolean(buyerAddress && order);
  const canUndo = Boolean(feedback && !feedback.isUndone);

  useEffect(() => {
    if (!order) {
      setRating("5");
      setComment("");
      return;
    }

    if (feedback) {
      const nextRating = Math.max(1, Math.min(5, Math.round(feedback.rating)));
      setRating(String(nextRating));
      setComment(feedback.comment ?? "");
      return;
    }

    setRating("5");
    setComment("");
  }, [
    order?.orderTxId,
    feedback?.updatedAt,
    feedback?.rating,
    feedback?.comment,
  ]);

  async function submit(publishOnChain: boolean): Promise<void> {
    if (!buyerAddress || !order) return;
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const parsedRating = Number(rating);
      if (
        !Number.isFinite(parsedRating) ||
        parsedRating < 1 ||
        parsedRating > 5
      ) {
        throw new Error("Rating must be between 1 and 5");
      }

      const submitRes = await apiRequest<{
        feedback: FeedbackSummary;
        wasCreated: boolean;
      }>("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress,
          orderTxId: order.orderTxId,
          rating: parsedRating,
          comment,
        }),
      });
      onFeedback(submitRes.feedback);
      setMsg("Feedback saved for marketplace reputation.");

      if (publishOnChain) {
        if (!submitRes.wasCreated) {
          setMsg(
            "Feedback updated for marketplace reputation. On-chain publish is allowed only on first feedback create for this order.",
          );
          return;
        }
        try {
          const score = Math.max(
            0,
            Math.min(100, Math.round((parsedRating / 5) * 100)),
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
          setMsg(
            "Feedback saved for marketplace reputation. Waiting for wallet signature to publish on-chain...",
          );
          const signed = (await signWithTimeout(signTransactions, [bytes]))[0];
          if (!signed) throw new Error("Wallet returned empty signature");
          const b64 = btoa(String.fromCharCode(...Array.from(signed)));
          await apiRequest<{ txId: string }>("/api/wallet/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signedTxn: b64 }),
          });
          setMsg("Feedback saved + published to on-chain seller reputation.");
        } catch (publishError) {
          if (isWalletCancelError(publishError)) {
            setError("");
            setMsg(
              "Feedback saved for marketplace reputation. On-chain publish was canceled in wallet.",
            );
            return;
          }
          if (isWalletPromptTimeout(publishError)) {
            setError(
              "Wallet signature prompt did not appear in time. Open your wallet extension/app and try Publish On-Chain again.",
            );
            setMsg("Feedback saved for marketplace reputation.");
            return;
          }
          if (isOnChainLogicReject(publishError)) {
            setError(
              "On-chain publish was rejected by contract rules (already published or not allowed for this state). Marketplace feedback is still saved.",
            );
            setMsg("Feedback saved for marketplace reputation.");
            return;
          }
          throw publishError;
        }
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

      {loading && (
        <p className="status-muted">
          <span className="loading-dots">Loading</span>
        </p>
      )}

      {!loading && !order && (
        <p className="status-muted">Load an order to leave feedback.</p>
      )}

      {!loading && order && (
        <div className="cyber-form" style={{ gap: 12 }}>
          <div className="feedback-guide">
            <p className="feedback-guide-title">How feedback works</p>
            <ol>
              <li>Choose a rating and save feedback to marketplace history.</li>
              <li>
                Use Publish On-Chain only once if you want permanent seller
                reputation update.
              </li>
              <li>
                You can edit marketplace feedback for 15 minutes; undo remains
                available anytime.
              </li>
            </ol>
          </div>

          {feedback && (
            <p className="status-muted">
              Current: {feedback.isUndone ? "Undone" : `${feedback.rating}/5`} •
              Updated {new Date(feedback.updatedAt).toLocaleString()}
            </p>
          )}

          <label>
            <span>RATING (1-5)</span>
            <div
              className="rating-buttons"
              role="group"
              aria-label="Choose rating"
            >
              {[1, 2, 3, 4, 5].map((value) => {
                const active = Number(rating) === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`rating-chip ${active ? "is-active" : ""}`}
                    onClick={() => setRating(String(value))}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
            <p className="status-muted">
              1 = poor access quality, 5 = excellent.
            </p>
          </label>
          <label>
            <span>COMMENT (OPTIONAL)</span>
            <textarea
              className="cyber-textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share delivery quality, account reliability, and support experience."
            />
          </label>

          <div className="feedback-actions">
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
              disabled={!canPublishOnChain || saving}
              onClick={() => submit(true)}
            >
              Publish On-Chain
            </button>
            <button
              className="btn-outline"
              type="button"
              disabled={!buyerAddress || saving || !canUndo}
              onClick={undo}
            >
              Undo Feedback
            </button>
          </div>

          {!buyerAddress && (
            <p className="status-muted">
              Connect wallet to publish feedback on-chain.
            </p>
          )}

          {feedback?.isUndone && (
            <p className="status-muted">
              This feedback is currently undone. Submit again to create a new
              active marketplace feedback entry.
            </p>
          )}

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
            On-chain publish is permanent and updates seller reputation score
            out of 100.
          </p>
        </div>
      )}
    </section>
  );
}
