"use client";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <Alert>
      <AlertTitle>Не удалось открыть телеметрию</AlertTitle>
      <AlertDescription>
        Попробуйте ещё раз. Вы сможете вернуться к сравнению по его ссылке.
        <Button onClick={reset}>Попробовать ещё раз</Button>
      </AlertDescription>
    </Alert>
  );
}
