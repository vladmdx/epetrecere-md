import { NextRequest, NextResponse } from "next/server";
import { createClerkClient } from "@clerk/backend";

// ⚠️ DEV-ONLY: generates a Clerk sign-in token so predefined test users can
// authenticate without email verification / OTP. Keep gated behind NODE_ENV.
const TEST_USERS: Record<string, string> = {
  igor: "user_3CAxS1yJV49PSYmtobIjBa2Rqqa",
  client: "user_3CAxS9f0MvVkCgLC2n0LDMXleE5",
};

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 403 });
  }

  const who = req.nextUrl.searchParams.get("user") || "";
  const userId = TEST_USERS[who];
  if (!userId) {
    return NextResponse.json({ error: "unknown user" }, { status: 400 });
  }

  const secretKey =
    process.env.CLERK_SECRET_KEY ||
    "sk_test_e0u46PbzBO579HpMo6D5tqBtvXNP9uxVmyrfiCa9Km";

  const clerk = createClerkClient({ secretKey });
  const token = await clerk.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: 600,
  });

  return NextResponse.json({ token: token.token });
}
