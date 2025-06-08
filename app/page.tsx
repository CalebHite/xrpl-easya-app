export default function Home() {
  return (
    <main className="min-h-screen flex flex-col justify-center items-center bg-gray-100">
      <div className="max-w-md text-center p-16 bg-white rounded-xl shadow-md">
        <h1 className="text-4xl font-bold text-blue-700 mb-4">Welcome to TrustLend</h1>
        <p className="text-lg text-gray-700 mb-8">A simple, decentralized platform for creating and managing loans on the XRP Ledger.</p>
        <a href="/login" className="inline-block px-8 py-3 bg-blue-600 text-white text-lg font-semibold rounded-full shadow hover:bg-blue-700 transition">
          Login to Get Started
        </a>
      </div>
    </main>
  );
}
