import React from 'react';

export default function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-40">
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-4"></div>
      {message && <div className="text-white text-lg font-semibold mt-2">{message}</div>}
    </div>
  );
} 