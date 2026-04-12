import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Body = {
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    expirationTime?: number | null;
  };
};

function subDocId(endpoint: string): string {
  return endpoint.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 800);
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.subscription?.endpoint || !body.subscription.keys) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const db = getAdminDb();
    const id = subDocId(body.subscription.endpoint);
    await db
      .collection("users")
      .doc(uid)
      .collection("pushSubscriptions")
      .doc(id)
      .set(
        {
          endpoint: body.subscription.endpoint,
          keys: body.subscription.keys,
          expirationTime: body.subscription.expirationTime ?? null,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Unauthorized or server error" }, { status: 401 });
  }
}
