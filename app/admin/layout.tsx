import type { Metadata } from "next";

// Separate install settings so "Add to Home Screen" from any admin page opens the admin dashboard
export const metadata: Metadata = {
  title: "Verank Admin",
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "Verank Admin", statusBarStyle: "default" },
  icons: { icon: "/admin-icon-192.png", apple: "/admin-icon-192.png" },
};

export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return children;
}
