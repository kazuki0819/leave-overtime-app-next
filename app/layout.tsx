import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "有給・残業管理システム",
  description: "社員の有給休暇と残業時間を管理するシステム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
