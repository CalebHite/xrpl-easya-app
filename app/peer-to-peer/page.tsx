"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PeerToPeerLoansPage() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('xrpl_wallet_active')) {
      router.replace('/login');
    }
  }, [router]);

  return (
    <>
      <main className="min-h-screen p-8 bg-gray-100">
        <div className="max-w-4xl mx-auto text-center mt-24">
          <h1 className="text-3xl font-bold mb-4 text-blue-700">Peer-to-Peer Loans</h1>
          <p className="text-lg text-gray-700 mb-8">This page will allow users to create and manage direct peer-to-peer loans. (Coming soon)</p>
        </div>
      </main>
    </>
  );
} 