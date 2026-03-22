export interface OnChainListing {
  txId: string;
  sender: string;
  type: string;
  service: string;
  price: number;
  seller: string;
  description: string;
  timestamp: number;
  zkCommitment?: string;
  round: number;
  reputationScore?: number;
  deliveryKind?:
    | "credentials"
    | "api_key"
    | "instructions"
    | "invite_link"
    | "provisioned"
    | "other";
  accessDurationDays?: number;
  productReputation?: number;
  productReviewCount?: number;
}

export interface OrderRecord {
  orderTxId: string;
  listingTxId: string;
  buyer: string;
  seller: string;
  type: string;
  service: string;
  price: number;
  description: string;
  deliveryKind?: OnChainListing["deliveryKind"];
  accessDurationDays?: number;
  createdAt: number;
  confirmedRound: number;
}

export interface DeliveryRecord {
  orderTxId: string;
  seller: string;
  deliveredAt: number;
  deliveryKind: NonNullable<OnChainListing["deliveryKind"]>;
  fields: Record<string, string>;
  instructions?: string;
}

export interface FeedbackSummary {
  orderTxId: string;
  listingTxId: string;
  buyer: string;
  seller: string;
  rating: number;
  comment?: string;
  createdAt: number;
  updatedAt: number;
  isUndone: boolean;
}

export interface ParsedIntent {
  serviceType: string;
  maxBudget: number;
  preferences: string[];
  rawMessage: string;
}

export interface X402Message {
  id: string;
  from: string;
  to: string;
  action: "offer" | "counter" | "accept" | "reject";
  payload: {
    listingTxId: string;
    service: string;
    price: number;
    message: string;
    round: number;
    zkVerified?: boolean;
  };
  timestamp: string;
}

export interface NegotiationSession {
  listingTxId: string;
  sellerAddress: string;
  sellerName: string;
  service: string;
  originalPrice: number;
  finalPrice: number;
  accepted: boolean;
  messages: X402Message[];
  zkVerified: boolean;
  rounds: number;
  sellerReputation?: number;
}

export interface EscrowState {
  status: "idle" | "funded" | "released" | "refunded";
  buyerAddress: string;
  sellerAddress: string;
  amount: number;
  txId: string;
  confirmedRound: number;
}

export interface AgentAction {
  id: string;
  agent: "buyer" | "seller" | "system" | "user";
  agentName: string;
  type:
    | "thinking"
    | "message"
    | "negotiation"
    | "transaction"
    | "result"
    | "discovery"
    | "verification";
  content: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface SessionState {
  sessionId: string;
  intent: ParsedIntent | null;
  listings: OnChainListing[];
  negotiations: NegotiationSession[];
  selectedDeal: NegotiationSession | null;
  escrow: EscrowState;
  actions: AgentAction[];
  phase:
    | "idle"
    | "parsing"
    | "initializing"
    | "discovering"
    | "negotiating"
    | "executing"
    | "completed"
    | "error";
  autoBuy: boolean;
}
