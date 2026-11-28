import { test, expect } from 'bun:test';
import { createIdentityStorage } from './identity-storage';
test('unverified reads and late writes are fenced; siblings survive detach', () => {
 const values = new Map<string,string>();
 const base = {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
 const a = createIdentityStorage(base); const b = createIdentityStorage(base);
 base.setItem('draft','ambiguous');
 expect(a.storage.getItem('draft')).toBeNull();
 a.adopt('A'); b.adopt('B');
 a.storage.setItem('draft','A draft'); b.storage.setItem('draft','B draft');
 a.detach(); a.storage.setItem('draft','late'); a.storage.removeItem('draft');
 expect(() => a.adopt('B')).toThrow('Document storage owner changed');
 expect(b.storage.getItem('draft')).toBe('B draft');
 a.adopt('A'); expect(a.storage.getItem('draft')).toBe('A draft');
});
