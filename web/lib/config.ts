// SHARED: product name and feature flags. The name lives here and in the agent persona string only.

export const APP_NAME = 'Remi';

// D builds against fixtures/demo/*.json until B's family endpoints exist.
// Flip to false (or set NEXT_PUBLIC_USE_FIXTURES=0) to read from the live API.
export const USE_FIXTURES = process.env.NEXT_PUBLIC_USE_FIXTURES !== '0';
