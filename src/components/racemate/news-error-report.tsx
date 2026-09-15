"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, Loader2 } from "lucide-react";

import {
  reportNewsErrorAction,
  type NewsErrorReportState,
} from "@/app/news/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

const initialState: NewsErrorReportState = { ok: false, message: "" };

export function NewsErrorReport({
  articleId,
  articleSlug,
}: {
  articleId: string;
  articleSlug: string;
}) {
  const [state, formAction] = useActionState(reportNewsErrorAction, initialState);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          aria-label="Сообщить об ошибке"
          className="size-9 shrink-0 px-0 sm:h-9 sm:w-auto sm:px-3"
          size="sm"
          title="Сообщить об ошибке"
          variant="ghost"
        >
          <CircleAlert aria-hidden="true" data-icon="inline-start" />
          <span className="hidden sm:inline">Сообщить об ошибке</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state.ok ? "Сообщение отправлено" : "Сообщить об ошибке"}</DialogTitle>
          <DialogDescription>
            {state.ok
              ? "Спасибо — команда RaceSide получила описание и данные для диагностики."
              : "Опиши, что в материале выглядит неверно. Мы добавим адрес страницы и безопасные технические данные автоматически."}
          </DialogDescription>
        </DialogHeader>
        {state.ok ? (
          <DialogFooter>
            <DialogClose asChild><Button>Закрыть</Button></DialogClose>
          </DialogFooter>
        ) : (
          <form action={formAction} className="grid gap-4">
            <input name="articleId" type="hidden" value={articleId} />
            <input name="articleSlug" type="hidden" value={articleSlug} />
            <Field>
              <FieldLabel htmlFor={`news-error-${articleId}`}>Что нужно исправить?</FieldLabel>
              <Textarea
                autoFocus
                id={`news-error-${articleId}`}
                maxLength={2_000}
                minLength={10}
                name="message"
                placeholder="Например, в тексте перепутаны гонщики или неверно указан результат"
                required
                rows={6}
              />
              <FieldDescription>Не добавляй пароли и другие личные данные.</FieldDescription>
            </Field>
            {state.message ? <p aria-live="polite" className="text-sm text-danger">{state.message}</p> : null}
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Отмена</Button></DialogClose>
              <ReportSubmitButton />
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReportSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit">
      {pending ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : null}
      {pending ? "Отправляется…" : "Отправить"}
    </Button>
  );
}
