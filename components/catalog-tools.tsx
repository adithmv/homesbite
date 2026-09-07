'use client';
import { useEffect, useRef } from 'react';
import { readCatalog } from '@/lib/catalog';
import { useStore } from './store';
type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
/** Optional browser-native catalog access; no checkout or privileged mutation is exposed. */
export function CatalogTools() {
  const store = useStore(),
    current = useRef(store);
  useEffect(() => {
    current.current = store;
  }, [store]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'read_homebite_catalog',
            title: 'Find HomeBite kitchens and dishes',
            description:
              'Search the currently visible approved kitchen catalog. Returns menu prices in paise and kitchen URLs. Does not add to a basket or place an order.',
            inputSchema: {
              type: 'object',
              properties: { query: { type: 'string', maxLength: 200 } },
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute(input) {
              if (current.current.loading)
                throw new Error('Catalog is loading. Try again shortly.');
              return readCatalog(current.current, input);
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {
        /* Optional API: ordinary app usage is unaffected. */
      });
    } catch {
      /* Unsupported browser API: ordinary app usage is unaffected. */
    }
    return () => lifecycle.abort();
  }, []);
  return null;
}
