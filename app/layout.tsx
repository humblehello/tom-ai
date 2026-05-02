import type { Metadata, Viewport } from "next";
import { Sora, Inter, Libre_Baskerville } from "next/font/google";
import FloatingJournal from "@/app/components/FloatingJournal";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const libreBaskerville = Libre_Baskerville({
  variable: "--font-baskerville",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Humble Hello",
  description: "Your personal relationship intelligence platform",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

// ← NEW: Tells mobile browsers to render at real device width instead of
// defaulting to a desktop width and scaling everything down.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script src="https://js.stripe.com/v3/" async />
        <style>{`
          @font-face {
            font-family: 'ITCSouvenir';
            src: url('/fonts/ITC_Souvenir_Std_Bold.otf') format('opentype');
            font-weight: bold;
            font-style: normal;
            font-display: swap;
          }
        `}</style>
      </head>
      <body className={`${sora.variable} ${inter.variable} ${libreBaskerville.variable} antialiased`}>
        {children}
        <FloatingJournal />
      </body>
    </html>
  );
}