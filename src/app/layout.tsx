import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { DialogProvider } from "@/components/ui/dialog-center";

export const metadata: Metadata = {
  title: "内容发布管理系统",
  description: "AI 内容创作与多平台发布管理系统",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <DialogProvider>
          <div className="relative flex h-screen overflow-hidden">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -top-32 -left-28 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl" />
              <div className="absolute -top-28 right-0 h-[420px] w-[420px] rounded-full bg-blue-500/20 blur-3xl" />
            </div>
            <div className="relative z-10 flex w-full">
              <Sidebar />
              <div className="flex flex-1 flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto px-4 py-6 md:px-6 md:py-8">
                  <div className="mx-auto max-w-7xl">{children}</div>
                </main>
              </div>
            </div>
          </div>
        </DialogProvider>
      </body>
    </html>
  );
}
