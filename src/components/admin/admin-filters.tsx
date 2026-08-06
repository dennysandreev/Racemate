import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function AdminFilters({
  search,
  status,
  statuses = [],
}: {
  search?: string;
  status?: string;
  statuses?: Array<{ value: string; label: string }>;
}) {
  return (
    <form className="grid gap-3 border-b border-border p-4 md:grid-cols-[minmax(16rem,1fr)_14rem_auto]" method="get">
      <FieldGroup className="contents">
        <Field>
          <FieldLabel htmlFor="admin-search">Поиск</FieldLabel>
          <Input defaultValue={search} id="admin-search" name="search" placeholder="Заголовок, имя или задача" />
        </Field>
        {statuses.length ? (
          <Field>
            <FieldLabel htmlFor="admin-status">Состояние</FieldLabel>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={status ?? "all"}
              id="admin-status"
              name="status"
            >
              <option value="all">Все</option>
              {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
        ) : <span />}
      </FieldGroup>
      <Button className="self-end" type="submit" variant="secondary">
        <Search aria-hidden="true" data-icon="inline-start" />
        Найти
      </Button>
    </form>
  );
}
