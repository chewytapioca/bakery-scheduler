import "@fontsource/zen-maru-gothic/latin-500.css";
import "@fontsource/zen-maru-gothic/latin-700.css";
import "@fontsource/mochiy-pop-one/latin-400.css";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bunbun Bakery · Production Scheduler", description: "Bakery production scheduling simulator" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}