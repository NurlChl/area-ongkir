import { DM_Sans } from "next/font/google";
import "./globals.css";
import { Metadata } from "next";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sistem Ekstraksi Kode Pos Radius 20km - Topsell Bhayangkara",
  description: "Sistem Informasi Jangkauan Ongkir Toko Pusat Mojokerto",
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  );
}
