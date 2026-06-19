import Image from "next/image";

type NewsImageProps = {
  alt: string;
  className?: string;
  priority?: boolean;
  src?: string;
};

export function NewsImage({ alt, className, priority = false, src }: NewsImageProps) {
  if (!src) {
    return null;
  }

  return (
    <div
      className={
        className ??
        "relative aspect-video overflow-hidden rounded-lg border border-border bg-muted"
      }
    >
      <Image
        alt={alt}
        className="object-cover"
        fill
        priority={priority}
        sizes="(max-width: 768px) 100vw, 48rem"
        src={src}
      />
    </div>
  );
}
