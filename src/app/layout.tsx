import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ARK Clipper - 쇼츠 자동 생성",
  description: "YouTube 롱폼 영상에서 쇼츠를 자동으로 만들어줍니다",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#0a1428] text-white font-[var(--font-geist)]">
        {children}
      </body>
    </html>
  );
}
