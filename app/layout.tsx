import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "STACK",
  description: "STACK — your roster, prioritized.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const rmThemeInitScript = `(function(){try{var k='rm-theme',t=localStorage.getItem(k);if(t==='ink'||t==='blue')document.documentElement.setAttribute('data-rm-theme',t);else document.documentElement.removeAttribute('data-rm-theme');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: rmThemeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--rm-bg)] text-[var(--rm-text)]`}
      >
        {children}
      </body>
    </html>
  );
}
