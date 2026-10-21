import type { Metadata, Viewport } from 'next';
import { Anuphan, Prompt } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const prompt = Prompt({
  variable: '--font-prompt',
  subsets: ['thai', 'latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
});

const anuphan = Anuphan({
  variable: '--font-anuphan',
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'แอ่วกัน · รถพร้อมคนขับเชียงใหม่', template: '%s · แอ่วกัน' },
  description: 'วางทริปบนแผนที่ แล้วเห็นราคาทันที รถพร้อมคนขับในเชียงใหม่ เหมาชั่วโมง เหมาวัน เหมาทริป หรือขาเดียว',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F6F1' },
    { media: '(prefers-color-scheme: dark)', color: '#0C110F' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="th" suppressHydrationWarning className={`${prompt.variable} ${anuphan.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
