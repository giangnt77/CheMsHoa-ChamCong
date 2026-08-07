'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.location.replace('/nhanvien');
    } else {
      router.replace('/nhanvien');
    }
  }, [router]);

  return (
    <html>
      <head>
        <meta httpEquiv="refresh" content="0;url=/nhanvien" />
      </head>
      <body className="bg-[#faf5ff] min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin mb-2" />
          <p className="text-xs font-black text-purple-950">Đang chuyển hướng...</p>
        </div>
      </body>
    </html>
  );
}
