import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/context/AppContext';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'Personal Finance Manager',
  description: 'Aplicación personal de control de finanzas, flujo de caja y proyecciones',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Personal Finance',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0f19',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark h-full">
      <head>
        <link rel="icon" href="/icons/icon-192.png" />
      </head>
      <body className="h-full bg-surface-dark text-gray-100 flex flex-col md:flex-row antialiased selection:bg-indigo-500 selection:text-white">
        <AppProvider>
          <Navigation />
          <main className="flex-1 overflow-y-auto pb-20 md:pb-6 min-h-screen">
            {children}
          </main>
        </AppProvider>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
