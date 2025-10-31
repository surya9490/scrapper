import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scrapper - Price Monitoring & Product Management",
  description: "Advanced web scraping and price monitoring platform with Shopify integration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50">
        {children}
      </body>
    </html>
  );
}
