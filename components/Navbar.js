'use client';

import Link from 'next/link';
import { getInitials } from '@/lib/utils';

export default function Navbar({ title, icon, employeeName, backHref = '/' }) {
  return (
    <>
      {/* Top Header */}
      <nav className="sticky top-0 z-40 bg-[rgba(9,9,17,0.75)] backdrop-blur-2xl border-b border-[rgba(255,255,255,0.08)] shadow-lg">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          {/* Brand Logo */}
          <Link href={backHref} className="flex items-center gap-2.5 no-underline group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(245,158,11,0.4)] group-hover:scale-105 transition-transform duration-300">
              {icon || '🍵'}
            </div>
            <div>
              <span className="font-[family-name:var(--font-playfair)] text-lg font-black text-white tracking-wide block leading-tight">
                {title || 'Tiệm Chè Ms Hoa'}
              </span>
              <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-widest block opacity-90">
                Hệ Thống Chấm Công & Xếp Lịch
              </span>
            </div>
          </Link>

          {/* User badge */}
          <div className="flex items-center gap-2.5">
            {employeeName && (
              <div className="flex items-center gap-2 px-3 py-1.5 glass rounded-full text-xs font-bold text-white border border-[rgba(245,158,11,0.3)] shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-400 to-rose-500 flex items-center justify-center text-[10px] font-black text-black">
                  {getInitials(employeeName)}
                </div>
                <span>{employeeName}</span>
              </div>
            )}

            <Link
              href={backHref}
              className="w-10 h-10 flex items-center justify-center glass rounded-2xl text-[var(--color-text-secondary)] hover:text-white transition-all no-underline text-base hover:scale-105 active:scale-95"
              title="Về trang chủ"
            >
              🏠
            </Link>
          </div>
        </div>
      </nav>
    </>
  );
}
