export const SUPABASE_ID_BATCH_SIZE = 20;

export function batchSupabaseIds(
  ids: readonly string[],
  batchSize = SUPABASE_ID_BATCH_SIZE,
) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("Размер пакета должен быть положительным целым числом.");
  }

  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const batches: string[][] = [];

  for (let index = 0; index < uniqueIds.length; index += batchSize) {
    batches.push(uniqueIds.slice(index, index + batchSize));
  }

  return batches;
}
