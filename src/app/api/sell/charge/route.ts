import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { errorResponse, readCustomer, readJson, readLines } from "@/lib/http";
import { markPaid, placeOrder } from "@/lib/orders";
import { IN_PERSON_HOLD_MINUTES } from "@/lib/site";
import type { PayMethod } from "@/lib/types";

/**
 * Selling in person (garage sale, Marketplace meetup): { lines, method, customer? }.
 *   method "cash" | "venmo" | "other": recorded as paid straight away.
 *   method "qr": the buyer scans a QR code and pays on their own phone (card or Bitcoin Cash);
 *                the items are held for 20 minutes meanwhile.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await readJson(request);
    const lines = readLines(body.lines);
    const customer = readCustomer(body.customer);
    if (body.method === "qr") {
      const order = await placeOrder({ lines, method: null, channel: "in_person", customer, holdMinutes: IN_PERSON_HOLD_MINUTES });
      return NextResponse.json({ order });
    }
    const method = body.method as PayMethod;
    if (!["cash", "venmo", "other"].includes(method)) return NextResponse.json({ error: "Pick how they're paying." }, { status: 400 });
    const order = await placeOrder({ lines, method, channel: "in_person", customer, holdMinutes: 10 });
    return NextResponse.json({ order: (await markPaid(order.id, method)) ?? order });
  } catch (e) {
    return errorResponse(e);
  }
}
