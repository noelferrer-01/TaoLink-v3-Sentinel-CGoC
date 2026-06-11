import {
  setClientBillingConfig,
  getClientBillingConfig,
  generateInvoice,
  getInvoiceWithLines,
} from './service';

export { setClientBillingConfig, getClientBillingConfig, generateInvoice, getInvoiceWithLines };
export type { BillingInvoiceWithLines } from './service';

export type { BillingInvoice, BillingInvoiceLine, ClientBillingConfig } from './schema';

export const billing = {
  setClientBillingConfig,
  getClientBillingConfig,
  generateInvoice,
  getInvoiceWithLines,
};
