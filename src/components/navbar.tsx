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
import { Bot, LogOut, Settings, Sparkles } from "lucide-react";

export function Navbar({ session }: { session: Session | null }) {
  const router = useRouter();
  const userRole = (session?.user as Session["user"] & { role?: string })?.role;

  if (!session) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/78 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-3 font-bold tracking-tight group">
          <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_10px_26px_rgba(23,27,47,0.18)] transition-transform duration-300 group-hover:scale-105">
            <Bot className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <span className="block text-[17px]">AI Work</span>
            <span className="hidden text-[11px] font-medium text-muted-foreground sm:block">Agent Studio</span>
          </div>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className="inline-flex items-center gap-2.5 rounded-full border border-border/60 bg-card/70 px-2.5 py-1.5 text-sm shadow-sm transition-colors hover:bg-card cursor-pointer select-none">
              <Sparkles className="hidden h-3.5 w-3.5 text-[#3678ff] sm:block" />
              <Avatar className="h-7 w-7 ring-1 ring-border">
                <AvatarFallback className="text-xs bg-accent text-accent-foreground font-medium">
                  {session.user?.name?.slice(0, 2) || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:inline">{session.user?.name}</span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            {userRole === "admin" && (
              <DropdownMenuItem
                onClick={() => router.push("/admin")}
                className="flex items-center gap-2.5 cursor-pointer"
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
                管理后台
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-2.5 cursor-pointer text-destructive focus:text-destructive"
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
