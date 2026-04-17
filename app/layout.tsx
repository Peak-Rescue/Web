import type { Metadata } from 'next'
import { Barlow_Condensed, Inter } from 'next/font/google'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

const barlowCondensed = Barlow_Condensed({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-barlow',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Peak Rescue — Anywhere. Any Terrain. Any Mission.',
    template: '%s | Peak Rescue',
  },
  description:
    'Professional rescue training and mountain guiding. Rope rescue, confined space, swiftwater, tactical mobility, and more — delivered by IFMGA-certified instructors with decades of field experience.',
  keywords: [
    'rope rescue training',
    'mountain rescue',
    'confined space rescue',
    'swiftwater rescue',
    'tactical training',
    'mountain guiding',
    'IFMGA guide',
  ],
  openGraph: {
    siteName: 'Peak Rescue',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${barlowCondensed.variable} ${inter.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-pr-bg text-pr-text antialiased">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
