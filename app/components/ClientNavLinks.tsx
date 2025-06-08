"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

export default function ClientNavLinks() {
  const [hasWallet, setHasWallet] = useState(false);
  const pathname = usePathname();
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasWallet(!!localStorage.getItem("xrpl_wallet_active"));
    }
    const onStorage = () => setHasWallet(!!localStorage.getItem("xrpl_wallet_active"));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  
  return (
    <Link
      href="/account"
      className={`px-4 py-2 rounded font-medium ${pathname === "/account" ? "text-green-700 bg-green-100" : "text-gray-700 hover:bg-gray-100"}`}
    >
      Account
    </Link>
  );
} 