import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { AuthProvider } from '@/lib/authStore';

export const metadata: Metadata = {
  title: 'DanubeGuard OS',
  description: 'Citizen science + Copernicus satellite data for a cleaner Danube.',
  themeColor: '#F0E9B6',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-sand">
        <AuthProvider>
          <div className="md:flex md:min-h-screen">
            <BottomNav variant="sidebar" />
            <div className="flex-1 flex flex-col min-h-screen md:ml-64">
              <Header />
              <main className="flex-1 pb-28 md:pb-8 pt-safe">{children}</main>
            </div>
          </div>
          <BottomNav variant="bottom" />
        </AuthProvider>
      </body>
    </html>
  );
}
