import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const nextUser = user as { role?: string; id?: string };
        token.role = nextUser.role;
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        const nextSessionUser = session.user as { role?: string; id?: string };
        nextSessionUser.role = typeof token.role === "string" ? token.role : undefined;
        nextSessionUser.id = typeof token.id === "string" ? token.id : undefined;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      if (isOnLogin) return true;
      if (!isLoggedIn) {
        return Response.redirect(new URL("/login", nextUrl.origin));
      }
      return true;
    },
  },
  providers: [],
  session: {
    strategy: "jwt",
  },
};
