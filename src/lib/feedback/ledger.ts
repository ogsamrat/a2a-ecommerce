import { promises as fs } from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { FeedbackSummary } from "@/lib/agents/types";

type FeedbackAction = "create" | "edit" | "undo";

interface FeedbackRevision {
  id: string;
  orderTxId: string;
  listingTxId: string;
  buyer: string;
  seller: string;
  rating: number;
  comment?: string;
  action: FeedbackAction;
  createdAt: number;
}

interface FeedbackLedger {
  revisions: FeedbackRevision[];
}

const FILE_PATH = path.join(
  process.cwd(),
  "artifacts",
  "runtime",
  "feedback-ledger.json",
);

const EDIT_WINDOW_MS = 15 * 60 * 1000;

async function ensureFile(): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  try {
    await fs.access(FILE_PATH);
  } catch {
    const initial: FeedbackLedger = { revisions: [] };
    await fs.writeFile(FILE_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readLedger(): Promise<FeedbackLedger> {
  await ensureFile();
  const raw = await fs.readFile(FILE_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw) as FeedbackLedger;
    if (!Array.isArray(parsed.revisions)) return { revisions: [] };
    return parsed;
  } catch {
    return { revisions: [] };
  }
}

async function writeLedger(ledger: FeedbackLedger): Promise<void> {
  await ensureFile();
  await fs.writeFile(FILE_PATH, JSON.stringify(ledger, null, 2), "utf8");
}

function normalizeRating(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function computeCurrentForOrder(
  revisions: FeedbackRevision[],
  orderTxId: string,
): {
  current: FeedbackRevision | null;
  firstCreate: FeedbackRevision | null;
  activeCreate: FeedbackRevision | null;
} {
  let current: FeedbackRevision | null = null;
  let firstCreate: FeedbackRevision | null = null;
  let activeCreate: FeedbackRevision | null = null;

  for (const rev of revisions) {
    if (rev.orderTxId !== orderTxId) continue;
    if (rev.action === "create") {
      if (!firstCreate) firstCreate = rev;
      activeCreate = rev;
      current = rev;
      continue;
    }

    if (rev.action === "undo") {
      current = null;
      activeCreate = null;
      continue;
    }

    if (rev.action === "edit") {
      current = rev;
    }
  }

  return { current, firstCreate, activeCreate };
}

function getLastRevisionForOrder(
  revisions: FeedbackRevision[],
  orderTxId: string,
): FeedbackRevision | null {
  let last: FeedbackRevision | null = null;
  for (const rev of revisions) {
    if (rev.orderTxId !== orderTxId) continue;
    last = rev;
  }
  return last;
}

export async function getFeedbackForOrder(
  orderTxId: string,
): Promise<FeedbackSummary | null> {
  const ledger = await readLedger();
  const { current, firstCreate, activeCreate } = computeCurrentForOrder(
    ledger.revisions,
    orderTxId,
  );
  if (!firstCreate) return null;
  const lastRevision = getLastRevisionForOrder(ledger.revisions, orderTxId);
  const updatedAt = lastRevision
    ? lastRevision.createdAt
    : firstCreate.createdAt;

  return {
    orderTxId,
    listingTxId: firstCreate.listingTxId,
    buyer: firstCreate.buyer,
    seller: firstCreate.seller,
    rating: current ? current.rating : firstCreate.rating,
    comment: current ? current.comment : firstCreate.comment,
    createdAt: activeCreate?.createdAt ?? firstCreate.createdAt,
    updatedAt,
    isUndone: current === null,
  };
}

export async function submitFeedback(input: {
  orderTxId: string;
  listingTxId: string;
  buyer: string;
  seller: string;
  rating: number;
  comment?: string;
  now?: number;
}): Promise<{ summary: FeedbackSummary; wasCreated: boolean }> {
  const now = Number.isFinite(Number(input.now))
    ? Number(input.now)
    : Date.now();
  const ledger = await readLedger();
  const { current, firstCreate, activeCreate } = computeCurrentForOrder(
    ledger.revisions,
    input.orderTxId,
  );

  const rating = normalizeRating(input.rating);
  if (!rating) throw new Error("rating must be 1-5");

  // Creating a new active feedback is always allowed when no feedback exists
  // yet, or after the previous one was undone.
  if (!firstCreate || !current) {
    const rev: FeedbackRevision = {
      id: uuidv4(),
      orderTxId: input.orderTxId,
      listingTxId: input.listingTxId,
      buyer: input.buyer,
      seller: input.seller,
      rating,
      comment: input.comment?.trim() ? input.comment.trim() : undefined,
      action: "create",
      createdAt: now,
    };
    ledger.revisions.push(rev);
    await writeLedger(ledger);
    const summary = (await getFeedbackForOrder(
      input.orderTxId,
    )) as FeedbackSummary;
    return { summary, wasCreated: true };
  }

  const editAnchor = activeCreate?.createdAt ?? firstCreate.createdAt;
  const withinEdit = now - editAnchor <= EDIT_WINDOW_MS;
  if (!withinEdit) {
    throw new Error(
      "Feedback is locked and can no longer be edited (undo is still allowed)",
    );
  }

  const rev: FeedbackRevision = {
    id: uuidv4(),
    orderTxId: input.orderTxId,
    listingTxId: input.listingTxId,
    buyer: input.buyer,
    seller: input.seller,
    rating,
    comment: input.comment?.trim() ? input.comment.trim() : undefined,
    action: current ? "edit" : "create",
    createdAt: now,
  };
  ledger.revisions.push(rev);
  await writeLedger(ledger);
  const summary = (await getFeedbackForOrder(
    input.orderTxId,
  )) as FeedbackSummary;
  return { summary, wasCreated: false };
}

export async function undoFeedback(input: {
  orderTxId: string;
  buyer: string;
  now?: number;
}): Promise<FeedbackSummary> {
  const now = Number.isFinite(Number(input.now))
    ? Number(input.now)
    : Date.now();
  const ledger = await readLedger();
  const { firstCreate } = computeCurrentForOrder(
    ledger.revisions,
    input.orderTxId,
  );
  if (!firstCreate) throw new Error("No feedback exists for this order");
  if (firstCreate.buyer !== input.buyer)
    throw new Error("Only the buyer can undo feedback");

  const rev: FeedbackRevision = {
    id: uuidv4(),
    orderTxId: input.orderTxId,
    listingTxId: firstCreate.listingTxId,
    buyer: firstCreate.buyer,
    seller: firstCreate.seller,
    rating: 0,
    action: "undo",
    createdAt: now,
  };
  ledger.revisions.push(rev);
  await writeLedger(ledger);
  const summary = (await getFeedbackForOrder(
    input.orderTxId,
  )) as FeedbackSummary;
  return summary;
}

export async function getSellerRating(
  seller: string,
): Promise<{ score: number; count: number }> {
  const ledger = await readLedger();
  const latestByOrder = new Map<string, FeedbackRevision | null>();
  const firstByOrder = new Map<string, FeedbackRevision>();

  for (const rev of ledger.revisions) {
    if (rev.seller !== seller) continue;
    if (!firstByOrder.has(rev.orderTxId) && rev.action === "create") {
      firstByOrder.set(rev.orderTxId, rev);
    }

    if (rev.action === "undo") {
      latestByOrder.set(rev.orderTxId, null);
      continue;
    }

    if (rev.action === "create" || rev.action === "edit") {
      latestByOrder.set(rev.orderTxId, rev);
    }
  }

  let sum = 0;
  let count = 0;
  for (const [orderTxId, latest] of latestByOrder.entries()) {
    if (!firstByOrder.has(orderTxId)) continue;
    if (!latest) continue;
    sum += latest.rating;
    count += 1;
  }

  return {
    score: count > 0 ? Number((sum / count).toFixed(2)) : 0,
    count,
  };
}

export async function getListingRating(
  listingTxId: string,
): Promise<{ score: number; count: number }> {
  const ledger = await readLedger();
  const latestByOrder = new Map<string, FeedbackRevision | null>();
  const firstByOrder = new Map<string, FeedbackRevision>();

  for (const rev of ledger.revisions) {
    if (rev.listingTxId !== listingTxId) continue;
    if (!firstByOrder.has(rev.orderTxId) && rev.action === "create") {
      firstByOrder.set(rev.orderTxId, rev);
    }

    if (rev.action === "undo") {
      latestByOrder.set(rev.orderTxId, null);
      continue;
    }

    if (rev.action === "create" || rev.action === "edit") {
      latestByOrder.set(rev.orderTxId, rev);
    }
  }

  let sum = 0;
  let count = 0;
  for (const [orderTxId, latest] of latestByOrder.entries()) {
    if (!firstByOrder.has(orderTxId)) continue;
    if (!latest) continue;
    sum += latest.rating;
    count += 1;
  }

  return {
    score: count > 0 ? Number((sum / count).toFixed(2)) : 0,
    count,
  };
}

export function getEditWindowMs(): number {
  return EDIT_WINDOW_MS;
}
