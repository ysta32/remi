import type { Metadata } from "next";
import { Figtree, Patrick_Hand } from "next/font/google";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

// Handwriting for snapshot captions only.
const patrick = Patrick_Hand({ variable: "--font-patrick", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: `${APP_NAME}: Grandpa calls, Remi listens, and the family gets his stories.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} ${patrick.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
