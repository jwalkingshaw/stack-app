import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-server";
import NotificationsClient from "./NotificationsClient";

export default async function NotificationsPage() {
  const user = await requireUser();

  if (!user?.id) {
    redirect("/login");
  }

  return <NotificationsClient />;
}
