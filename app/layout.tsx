import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MBI Opportunities Hub',
  description:
    'MBI opportunities hub — Enterprise CRM for MSME business opportunity tracking, proposal management, and Google Sheets integration by MindBridge Industries.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
