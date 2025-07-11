"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function HeaderNavLinks() {
  const pathname = usePathname();
  return (
    <>
      <Link
        href="/trustlend-loans"
        className={`px-4 py-2 rounded font-medium ${pathname === "/trustlend-loans" ? "text-blue-700 bg-blue-100" : "text-gray-700 hover:bg-gray-100"}`}
      >
        Request a Loan
      </Link>
    </>
  );
} 