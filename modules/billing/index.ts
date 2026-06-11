import {
  setClientBillingConfig,
  getClientBillingConfig,
  generateInvoice,
  getInvoiceWithLines,
  finalizeInvoice,
  markPaid,
} from './service';

export {
  setClientBillingConfig,
  getClientBillingConfig,
  generateInvoice,
  getInvoiceWithLines,
  finalizeInvoice,
  markPaid,
};
export type { BillingInvoiceWithLines } from './service';

export type { BillingInvoice, BillingInvoiceLine, ClientBillingConfig } from './schema';

export const billing = {
  setClientBillingConfig,
  getClientBillingConfig,
  generateInvoice,
  getInvoiceWithLines,
  finalizeInvoice,
  markPaid,
};
