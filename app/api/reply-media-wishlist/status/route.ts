import { NextResponse } from "next/server";
import { z } from "zod";
import { setReplyMediaWishlistStatus } from "@/src/server/reply-media-wishlist";
import { logRouteError } from "@/src/server/api-error";

const requestSchema = z.object({
  key: z.string().min(1),
  status: z.enum(["pending", "collected", "dismissed"])
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const updated = setReplyMediaWishlistStatus(body.key, body.status);

    if (!updated) {
      return NextResponse.json({ error: "Unknown wishlist key" }, { status: 404 });
    }

    return NextResponse.json({ key: updated.key, status: updated.status });
  } catch (error) {
    const message = logRouteError("reply-media-wishlist/status", request, error, "Unknown wishlist status error");
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
