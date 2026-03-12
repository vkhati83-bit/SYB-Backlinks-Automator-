import type { Metadata } from 'next';
import './globals.css';
import AuthLayout from '../components/AuthLayout';

export const metadata: Metadata = {
  title: 'SYB Backlinks Dashboard',
  description: 'Backlink Automation System for ShieldYourBody',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-50 min-h-screen" suppressHydrationWarning>
        <AuthLayout>{children}</AuthLayout>
      </body>
    </html>
  );
}
