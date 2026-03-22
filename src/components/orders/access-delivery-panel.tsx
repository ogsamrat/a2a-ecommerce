"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import type { DeliveryRecord, OrderRecord } from "@/lib/agents/types";

function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 6) return "••••••";
  return `${"•".repeat(Math.min(10, value.length - 4))}${value.slice(-4)}`;
}

export function AccessDeliveryPanel({
  order,
  delivery,
}: {
  order: OrderRecord | null;
  delivery: DeliveryRecord | null;
}) {
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  const deliveryFields = useMemo(() => {
    return delivery?.fields ? Object.entries(delivery.fields) : [];
  }, [delivery?.fields]);

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  return (
    <article className="cyber-card holographic-panel">
      <div className="section-head">
        <CheckCircle2 size={18} />
        <h3>Access Delivery</h3>
      </div>

      {!order && <p className="status-muted">No order loaded yet.</p>}

      {order && !delivery && (
        <p className="status-muted">
          Delivery not submitted yet. Once the seller posts an on-chain delivery
          proof and uploads access details, you can reveal them here.
        </p>
      )}

      {delivery && (
        <div className="list-stack">
          {delivery.instructions && (
            <div className="list-item" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0 }}>Instructions</p>
                <span style={{ whiteSpace: "pre-wrap" }}>
                  {delivery.instructions}
                </span>
              </div>
              <button
                className="btn-outline"
                type="button"
                onClick={() => copy(delivery.instructions ?? "")}
              >
                Copy
              </button>
            </div>
          )}

          {deliveryFields.map(([k, v]) => {
            const isOpen = Boolean(reveal[k]);
            return (
              <div key={k} className="list-item">
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0 }}>{k}</p>
                  <span style={{ wordBreak: "break-all" }}>
                    {isOpen ? v : mask(v)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn-outline"
                    type="button"
                    onClick={() => setReveal((p) => ({ ...p, [k]: !p[k] }))}
                  >
                    {isOpen ? <EyeOff size={14} /> : <Eye size={14} />}
                    {isOpen ? "Hide" : "Reveal"}
                  </button>
                  <button
                    className="btn-outline"
                    type="button"
                    onClick={() => copy(v)}
                  >
                    Copy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
