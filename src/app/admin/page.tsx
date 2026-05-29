import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AdminPanel } from "./admin-panel";

export default async function AdminPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || role !== "admin") redirect("/");

  return <AdminPanel />;
}
