import { AcceptInvite } from "@/components/accept-invite";

export default async function AcceptInvitePage({ searchParams }: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const candidate = (await searchParams).email;
  const email = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
  const inviteEmail = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  return <AcceptInvite initialEmail={inviteEmail} />;
}
