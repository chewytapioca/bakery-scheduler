import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bunbun Bakery · Production Scheduler", description: "Bakery production scheduling simulator" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
