import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free WhatsApp Link & QR Generator | Aira AI",
  description:
    "Create a click-to-chat WhatsApp link with a pre-filled message and download a printable QR code. Free, no sign-up.",
  openGraph: {
    title: "Free WhatsApp Link & QR Generator",
    description: "Build click-to-chat links and QR codes for your WhatsApp business number.",
    type: "website",
  },
};

export default function ToolLayout({ children }: { children: React.ReactNode }) {
  return children;
}
