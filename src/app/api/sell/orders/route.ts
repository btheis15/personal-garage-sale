import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { listOrders } from "@/lib/orders";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ orders: await listOrders() });
  } catch (e) {
    return errorResponse(e);
  }
}
