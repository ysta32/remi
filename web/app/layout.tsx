import type { Metadata } from "next";
import Link from "next/link";
import { Figtree, Fraunces } from "next/font/google";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

const body = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: `${APP_NAME} keeps the family close to Grandpa's stories, one FaceTime chat at a time.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line/70">
          <div className="mx-auto flex max-w-6xl items-center px-5 py-4">
            <Link href="/" className="font-display text-2xl font-semibold tracking-tight text-accent">
              {APP_NAME}
            </Link>
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
