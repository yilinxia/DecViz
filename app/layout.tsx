import type React from "react"
import type { Metadata } from "next"
import { Toaster } from "@/components/toaster"
import { Suspense } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "DecViz - Purpose-Driven Graph Visualization",
  description: "Purpose-Driven Graph Visualization via Declarative Transformation",
  generator: "v0.app",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon-32x32.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Suspense fallback={null}>
          {children}
          <Toaster />
        </Suspense>
      </body>
    </html>
  )
}
