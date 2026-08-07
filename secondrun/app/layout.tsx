import type { Metadata } from "next";
import { Fira_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

// Fira Sans, matching PlainSight — and, unlike Instrument Sans, it actually
// carries a 900. Instrument Sans' variable axis stops at 700, so the wordmark
// was silently clamped no matter what weight the CSS asked for.
const firaSans = Fira_Sans({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rote",
  description:
    "Agents redo work they have already done. We keep a memory of how they solved it — same answer, a fraction of the price.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${firaSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
