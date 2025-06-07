"use client";
import { useEffect, useState } from "react";

export default function ClientNavLinks() {
  const [hasWallet, setHasWallet] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasWallet(!!localStorage.getItem("xrpl_wallet"));
    }
    const onStorage = () => setHasWallet(!!localStorage.getItem("xrpl_wallet"));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return hasWallet ? (
    <a href="/account" className="px-4 py-2 rounded font-medium text-green-700 hover:bg-green-100">Account</a>
  ) : (
    <a href="/login" className="px-4 py-2 rounded font-medium text-gray-700 hover:bg-gray-100">Login</a>
  );
} 