"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Shield } from "lucide-react";

import { AdminCommandMenu } from "@/components/admin/admin-command-menu";
import { adminNavigation } from "@/components/admin/admin-navigation";
import { RaceMateLogo, RaceMateMark } from "@/components/racemate/racemate-logo";
import { ThemeToggle } from "@/components/racemate/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export function AdminShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  const pathname = usePathname();
  const navigationGroups = [...new Set(adminNavigation.map((item) => item.group))];

  return (
    <SidebarProvider
      className="admin-shell"
      style={
        {
          "--sidebar-width": "17rem",
          "--sidebar-width-icon": "3.5rem",
        } as React.CSSProperties
      }
    >
      <a className="sr-only z-50 rounded-md bg-background px-4 py-3 text-sm font-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4" href="#admin-main">
        Перейти к содержанию
      </a>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-sidebar-border p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="RaceSide — админка">
                <Link aria-label="RaceSide, операционная панель" className="group" href="/admin">
                  <RaceMateMark className="hidden h-5 w-[2.625rem] group-data-[collapsible=icon]:block" />
                  <RaceMateLogo className="group-data-[collapsible=icon]:hidden" />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {navigationGroups.map((group) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel>{group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavigation.filter((item) => item.group === group).map((item) => {
                  const active = item.href === "/admin"
                    ? pathname === item.href
                    : pathname.startsWith(item.href);

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={item.href}>
                          <item.icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Открыть публичный сайт">
                <Link href="/" target="_blank">
                  <ExternalLink aria-hidden="true" />
                  <span>Публичный сайт</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="group-data-[collapsible=icon]:hidden">
            <ThemeToggle />
          </div>
          <div className="flex min-w-0 items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center">
            <Shield aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              {email}
            </span>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-sm md:px-6">
          <SidebarTrigger />
          <AdminCommandMenu />
        </header>
        <main className="min-w-0 flex-1" id="admin-main">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
