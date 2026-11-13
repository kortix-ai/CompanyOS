'use client';

import { createContext, useContext } from 'react';

/** The open topic tab and the way to switch it, for links inside a topic. */
export interface DocNav {
  active: string;
  select: (slug: string) => void;
}

export const DocNavContext = createContext<DocNav>({ active: 'introduction', select: () => {} });

export function useDocNav(): DocNav {
  return useContext(DocNavContext);
}
