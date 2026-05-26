"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bot, LogOut, Settings } from "lucide-react";

export function Navbar({ session }: { session: Session | null }) {
  const router = useRouter();

  if (!session) return null;

  return (
    <header className="border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
          <Bot className="h-5 w-5" />
          Agent 终端
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className="inline-flex items-center gap-2 rounded-lg px-0 py-0 text-sm hover:bg-muted hover:text-foreground cursor-pointer select-none">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">
                  {session.user?.name?.slice(0, 2) || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">{session.user?.name}</span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(session.user as any)?.role === "admin" && (
              <DropdownMenuItem
                onClick={() => router.push("/admin")}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Settings className="h-4 w-4" />
                管理后台
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-2 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
