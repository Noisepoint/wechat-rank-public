import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "公众号热榜 - AI领域文章热度监测",
  description: "监测AI领域公众号文章热度，发现爆款选题",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <Navbar />
        <main className="container mx-auto px-4 md:px-6 lg:px-8 py-6 max-w-7xl">
          {children}
        </main>
        <Toaster />
      </body>
    </html>
  );
}
