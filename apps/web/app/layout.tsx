import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '系岛食堂扫码点餐',
  description: '小店扫码点餐系统第一版',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

