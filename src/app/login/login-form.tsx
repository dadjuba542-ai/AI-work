"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Sparkles, ArrowRight } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("邮箱或密码错误");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/4 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/4 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 mb-5">
            <Bot className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">AI Work</h1>
          <p className="text-muted-foreground mt-2">登录以使用 AI Agent 助手</p>
        </div>

        <Card className="border-border/60 shadow-xl shadow-black/5">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-lg">欢迎回来</CardTitle>
            <CardDescription>输入你的账号信息继续</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">账号</Label>
                <Input
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="输入账号"
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入密码"
                  required
                  className="h-11"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-destructive shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-11 text-base font-medium" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    登录中...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    登录
                    <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          <span>AI Work — 智能 Agent 能力市场</span>
        </div>
      </div>
    </div>
  );
}
