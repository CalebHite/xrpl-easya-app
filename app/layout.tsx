import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ClientNavLinks from "./components/ClientNavLinks";

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
    <header className="sticky top-0 z-30 bg-white shadow mb-8">
      <div className="max-w-4xl mx-auto flex items-center justify-between py-4 px-4">
        <a href="/" className="text-2xl font-bold text-blue-700 tracking-tight hover:underline">TrustLend</a>
        <nav className="flex space-x-4">
          <a href="/peer-to-peer" className="px-4 py-2 rounded font-medium text-gray-700 hover:bg-gray-100">Peer-to-Peer Loans</a>
          <a href="/trustlend-loans" className="px-4 py-2 rounded font-medium text-blue-700 bg-blue-100">TrustLend Loans</a>
          <ClientNavLinks />
        </nav>
      </div>
    </header>
  );
}
