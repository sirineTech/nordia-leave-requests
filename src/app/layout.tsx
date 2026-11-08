import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./entry.css";

export const metadata: Metadata = {
  title: "Nordia — A little balance, every day",
  description:
    "A thoughtful space for time off. Request leave, find your balance, and keep your team in sync with Nordia.",
  applicationName: "Nordia Leave Management System",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("nordia-theme");if(["forest","ocean","lavender","night"].indexOf(t)>-1)document.documentElement.dataset.theme=t}catch(e){}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
