type JsonLdValue =
  | JsonLdValue[]
  | boolean
  | null
  | number
  | string
  | { [key: string]: JsonLdValue | undefined };

export function JsonLd({ data }: { data: JsonLdValue }) {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
      type="application/ld+json"
    />
  );
}
