import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NEXUS // Company brain",
  description: "An office floor view of teams, owners, services and decisions, backed by a FalkorDB decision graph.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
