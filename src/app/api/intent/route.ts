import { NextRequest, NextResponse } from "next/server";
import { parseIntent } from "@/lib/agents/buyer-agent";
import { createAction } from "@/lib/a2a/messaging";

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    const actions = [
      createAction(
        "buyer",
        "Buyer Agent",
        "thinking",
        "Parsing your intent using AI...",
      ),
    ];

    const intent = await parseIntent(message);

    actions.push(
      createAction(
        "buyer",
        "Buyer Agent",
        "result",
        `Understood! Looking for **${intent.serviceType}** with a budget of **${intent.maxBudget} ALGO**.${intent.preferences.length > 0 ? ` Preferences: ${intent.preferences.join(", ")}` : ""}`,
        { intent },
      ),
    );

    return NextResponse.json({ intent, actions });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to parse intent";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
