interface StorageAdapter {
 getItem(key: string): string | null;
 setItem(key: string, value: string): unknown;
 removeItem(key: string): unknown;
}
/** Immutable document owner. Detached writers cannot write into another identity. */
export function createIdentityStorage(base: StorageAdapter) {
 let owner: string | null = null;
 let attached = false;
 const key = (name: string) => `identity-storage:${encodeURIComponent(owner!)}:${name}`;
 return {
  adopt(userId: string) {
   if (owner && owner !== userId) throw new Error('Document storage owner changed');
   owner = userId; attached = true;
  },
  detach() { attached = false; },
  storage: {
   getItem(name: string) { return attached ? base.getItem(key(name)) : null; },
   setItem(name: string, value: string) { if (attached) base.setItem(key(name), value); },
   removeItem(name: string) { if (attached) base.removeItem(key(name)); },
  },
 };
}
