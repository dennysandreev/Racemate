"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs } from "@/components/ui/tabs";

export function AdminUrlTabs({
  children,
  defaultValue,
  values,
}: {
  children: React.ReactNode;
  defaultValue: string;
  values: readonly string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const value = requested && values.includes(requested) ? requested : defaultValue;

  return (
    <Tabs
      onValueChange={(nextValue) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", nextValue);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }}
      value={value}
    >
      {children}
    </Tabs>
  );
}
