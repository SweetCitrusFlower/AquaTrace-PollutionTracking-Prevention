import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import ThemeApplicator from '@/components/ThemeApplicator';
import PWARegister from '@/components/PWARegister';
import { AuthProvider } from '@/lib/authStore';

export const metadata: Metadata = {
  title: 'AquaTrace OS',
  description: 'Citizen science + Copernicus satellite data for a cleaner Danube.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'AquaTrace',
  },
  icons: {
    icon: '/icon-192.svg',
    apple: '/icon-192.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#35858E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-sand dark:bg-[#111827] transition-colors duration-300">
        <AuthProvider>
          {/* Applies theme class + lang attr to <html> based on user prefs */}
          <ThemeApplicator />
          {/* Registers service worker for PWA install support */}
          <PWARegister />
          <div className="flex flex-col md:flex-row min-h-screen">
            {/* Sidebar - hidden on mobile, fixed on desktop */}
            <div className="hidden md:block">
              <BottomNav variant="sidebar" />
            </div>
            {/* Main content area */}
            <div className="flex-1 flex flex-col min-h-screen md:pl-64">
              <Header />
              <main className="flex-1 pb-28 md:pb-8 pt-safe">{children}</main>
            </div>
          </div>
          {/* Bottom nav - visible only on mobile */}
          <div className="md:hidden">
            <BottomNav variant="bottom" />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
