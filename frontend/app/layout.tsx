import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WhatsApp Auto Reply Bot',
  description: 'AI-Powered WhatsApp Auto Reply Dashboard with Gemini AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
