import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { Toaster } from "@/components/ui/sonner";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Операционная панель | RaceSide",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <>
      <AdminShell email={user.email ?? "Администратор"}>{children}</AdminShell>
      <Toaster closeButton position="bottom-right" />
    </>
  );
}
