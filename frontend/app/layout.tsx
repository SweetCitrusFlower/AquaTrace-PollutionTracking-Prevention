import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DanubeGuard OS",
  description: "Water pollution monitoring and prevention for the Danube basin.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}