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
}) {
  return (
    <>
      {/* Top Header - Chè Ms Hoa Brand Purple Bar */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-purple-100 shadow-2xs">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 py-2 flex items-center justify-between">
          {/* Brand Logo & Title */}
          <Link
            href={backHref}
            onClick={(e) => {
              if (onBackClick) {
                e.preventDefault();
                onBackClick();
              }
            }}
            className="flex items-center gap-2.5 no-underline group"
          >
            <div className="w-11 h-11 rounded-xl bg-white p-0.5 border border-purple-200 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform overflow-hidden">
              <img
                src="/logo.png"
                alt="Chè Ms Hoa Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <span className="text-base sm:text-lg font-black text-purple-950 tracking-tight block leading-tight">
                {title || 'Chè Ms Hoa'}
              </span>
              <span className="text-[10px] sm:text-[11px] text-purple-700 font-extrabold uppercase tracking-wider block">
                ❤ CHÈ ÍT NGỌT ❤
              </span>
            </div>
          </Link>

          {/* User badge & Action button */}
          <div className="flex items-center gap-2">
            {employeeName && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-xl text-xs sm:text-sm font-extrabold text-purple-950 border border-purple-200/80">
                <div className="w-5 h-5 rounded-md bg-purple-700 text-white flex items-center justify-center text-[10px] font-black">
                  {employeeName.charAt(0).toUpperCase()}
                </div>
                <span className="font-black text-purple-950">{employeeName}</span>
              </div>
            )}

            <Link
              href={backHref}
              onClick={(e) => {
                if (onBackClick) {
                  e.preventDefault();
                  onBackClick();
                }
              }}
              className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-purple-50 border border-purple-200/80 rounded-xl text-purple-800 hover:bg-purple-100 transition-all no-underline text-base font-bold cursor-pointer"
              title={homeTitle}
            >
              {homeIcon}
            </Link>
          </div>
        </div>
      </nav>
    </>
  );
}
