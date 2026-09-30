import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = request.nextUrl.searchParams.get("next");
  const safeNext = next === "/reset-password" || next === "/onboarding" ? next : "/";
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.redirect(new URL("/login?recovery=unavailable", request.url));
  }

  let verified = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    verified = !error;
  }

  if (verified) return NextResponse.redirect(new URL(safeNext, request.url));
  return NextResponse.redirect(new URL("/login?recovery=invalid", request.url));
}
