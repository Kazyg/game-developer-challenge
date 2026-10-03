// Every started branch must settle before its owning renderer can be released.
export async function initializeAssets<T extends readonly unknown[]>(tasks: { [K in keyof T]: Promise<T[K]> }): Promise<T> {
  const settled = await Promise.allSettled(tasks)
  const failure = settled.find(result => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  return settled.map(result => (result as PromiseFulfilledResult<unknown>).value) as unknown as T
}
