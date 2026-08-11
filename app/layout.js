import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata = {
  title: "Chè MsHoa - Hệ Thống Chấm Công - Tính Lương",
  description: "Chè MsHoa - Đăng ký ca làm, xem lịch và tính lương tự động.",
  keywords: "chấm công, tính lương, quản lý nhân viên, chè mshoa",
  openGraph: {
    title: "Chè MsHoa - Hệ Thống Chấm Công - Tính Lương",
    description: "Chè MsHoa - Đăng ký ca làm, xem lịch và tính lương tự động.",
    siteName: "Chè MsHoa",
    locale: "vi_VN",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Chè MsHoa - Hệ Thống Chấm Công - Tính Lương",
    description: "Chè MsHoa - Đăng ký ca làm, xem lịch và tính lương tự động.",
  },
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="vi"
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof globalThis === 'undefined') { window.globalThis = window; }
              if (typeof window !== 'undefined' && !window.structuredClone) {
                window.structuredClone = function(obj) { return JSON.parse(JSON.stringify(obj)); };
              }
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Animated Background Orbs */}
        <div className="bg-orb bg-orb-1" aria-hidden="true" />
        <div className="bg-orb bg-orb-2" aria-hidden="true" />
        <div className="bg-orb bg-orb-3" aria-hidden="true" />
        
        {children}
      </body>
    </html>
  );
}
