'use client';

import Link from 'next/link';

export default function Navbar({
  title,
  icon,
  employeeName,
  backHref = '/nhanvien',
  onBackClick,
  homeIcon = '🏠',
  homeTitle = 'Về trang chủ',
  showRulesLink = false,
}) {
  return (
    <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-purple-100 shadow-2xs">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 py-2 flex items-center justify-between gap-2">
        {/* Brand Logo & Title */}
        <Link
          href={backHref}
          onClick={(e) => {
            if (onBackClick) {
              e.preventDefault();
              onBackClick();
            }
          }}
          className="flex items-center gap-2 no-underline group shrink-0"
        >
          <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl bg-white p-0.5 border border-purple-200 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform overflow-hidden shrink-0">
            <img
              src="/logo.png"
              alt="Chè Ms Hoa Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="leading-tight">
            <span className="text-sm sm:text-lg font-black text-purple-950 tracking-tight block whitespace-nowrap">
              {title || 'Chè Ms Hoa'}
            </span>
            <span className="hidden sm:block text-[10px] sm:text-[11px] text-purple-700 font-extrabold uppercase tracking-wider">
              ❤ CHÈ ÍT NGỌT ❤
            </span>
          </div>
        </Link>

        {/* User badge & Rules Button */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap">
          {showRulesLink && (
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLSfvXOcjD_oU7NnqvaSUQOt5fKPr3M1-XcT1nB9NdTp1b4qDcQ/viewform?pli=1"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-purple-950 text-xs font-black cursor-pointer transition-all active:scale-95 flex items-center gap-1 shadow-2xs border border-amber-500/50 no-underline whitespace-nowrap"
              title="Bấm để xem Nội Quy - Quy Định - Hướng Dẫn Chè Ms Hoa"
            >
              <span>📋</span>
              <span>Nội Quy</span>
            </a>
          )}

          {employeeName && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-purple-100/80 rounded-xl text-xs font-black text-purple-950 border border-purple-200 whitespace-nowrap shadow-2xs">
              <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-md bg-purple-700 text-white flex items-center justify-center text-[9px] sm:text-[10px] font-black shrink-0">
                {employeeName.charAt(0).toUpperCase()}
              </div>
              <span className="font-black text-purple-950">
                {employeeName}
              </span>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
