import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

// Entry point. Routes the user based on session:
//  - not logged in -> /login
//  - admin         -> /admin
//  - holder        -> /survey (NDA gate enforced downstream)
export const dynamic = "force-dynamic";

export default async function Home() {
  const { isAdmin, holder } = await getSessionContext();
  if (isAdmin) redirect("/admin");
  if (holder) redirect("/survey");
  redirect("/login");
}
