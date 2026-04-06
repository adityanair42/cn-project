import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "RUDP Simulator",
  description: "Interactive Reliable UDP protocol simulator with real-time packet visualization and protocol comparison.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased`} style={{ background: '#0a0c10', color: '#e5e7eb' }}>
        {children}
      </body>
    </html>
  );
}
