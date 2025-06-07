import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ClientNavLinks from "./components/ClientNavLinks";
import HeaderNavLinks from "./components/HeaderNavLinks";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "XRPL Loan Contract System",
  description: "A decentralized loan contract system built on the XRP Ledger",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Header />
        {children}
      </body>
    </html>
  );
}

function Header() {
  // This is a client component for navigation
  // eslint-disable-next-line @next/next/no-async-client-component
  return (
    <header className="sticky top-0 z-30 bg-white shadow">
      <div className="max-w-4xl mx-auto flex items-center justify-between py-4 px-4">
        <a href="/" className="text-2xl font-bold text-blue-700 tracking-tight hover:underline">TrustLend</a>
        <nav className="flex space-x-4">
          <HeaderNavLinks />
          <ClientNavLinks />
        </nav>
      </div>
    </header>
  );
}
