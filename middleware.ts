import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;

  // Skip auth if no password is set (local development)
  if (!adminPassword) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader) {
    const [scheme, encoded] = authHeader.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const [, password] = decoded.split(":");
      if (password === adminPassword) {
        const response = NextResponse.next();
        // APIレスポンスのブラウザキャッシュを無効化
        if (request.nextUrl.pathname.startsWith("/api/")) {
          response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
          response.headers.set("Pragma", "no-cache");
        }
        return response;
      }
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Leave & Overtime Management"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
