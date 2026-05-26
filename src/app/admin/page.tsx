import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AdminPanel } from "./admin-panel";

export default async function AdminPage() {
  const session = await auth();
  if (!session || (session.user as any).role !== "admin") redirect("/");

  return <AdminPanel />;
}
