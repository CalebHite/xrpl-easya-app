"use client";

export default function PeerToPeerLoansPage() {
  return (
    <>
      {/* Header with tabs */}
      <header className="sticky top-0 z-20 bg-white shadow mb-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between py-4 px-4">
          <a href="/" className="text-2xl font-bold text-blue-700 tracking-tight hover:underline">TrustLend</a>
          <nav className="flex space-x-4">
            <a href="/peer-to-peer" className="px-4 py-2 rounded font-medium text-blue-700 bg-blue-100">Peer-to-Peer Loans</a>
            <a href="/trustlend-loans" className="px-4 py-2 rounded font-medium text-gray-700 hover:bg-gray-100">TrustLend Loans</a>
          </nav>
        </div>
      </header>
      <main className="min-h-screen p-8 bg-gray-100">
        <div className="max-w-4xl mx-auto text-center mt-24">
          <h1 className="text-3xl font-bold mb-4 text-blue-700">Peer-to-Peer Loans</h1>
          <p className="text-lg text-gray-700 mb-8">This page will allow users to create and manage direct peer-to-peer loans. (Coming soon)</p>
        </div>
      </main>
    </>
  );
} 