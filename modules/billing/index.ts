import { setClientBillingConfig, getClientBillingConfig } from './service';

export { setClientBillingConfig, getClientBillingConfig };

export type { BillingInvoice, BillingInvoiceLine, ClientBillingConfig } from './schema';

export const billing = {
  setClientBillingConfig,
  getClientBillingConfig,
};
