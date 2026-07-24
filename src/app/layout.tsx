import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import { PwaRegister } from "@/components/pwa-register";
import { CapacitorInit } from "@/components/capacitor-init";
import "./globals.css";

const GA_MEASUREMENT_ID = "G-SY3XQJ0R3S";
const CLARITY_PROJECT_ID = "x8i2rlh6is";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "OutsiderMap - ten thousand places, one answer",
    template: "%s · OutsiderMap",
  },
  description:
    "OutsiderMap learns your taste and turns “it’s 3am and I want something” into exactly where to go - one confident answer, not ten thousand options. Built for every city, launching in Delhi.",
  openGraph: {
    siteName: "OutsiderMap",
    type: "website",
    locale: "en_IN",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Outsider",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c0a08",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${geistSans.variable} ${geistMono.variable}`}
      // Browser extensions and remote-frame/casting layers inject attributes
      // onto <html> before React hydrates (e.g. __gcrremoteframetoken). Those
      // are outside our control and harmless - don't warn on them.
      suppressHydrationWarning
    >
      <body>
        {children}
        <PwaRegister />
        <CapacitorInit />
        <Analytics />
      </body>
      {/* Google tag (gtag.js) */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
      </Script>
      {/* Microsoft Clarity */}
      <Script id="microsoft-clarity" strategy="afterInteractive">
        {`(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`}
      </Script>
    </html>
  );
}
