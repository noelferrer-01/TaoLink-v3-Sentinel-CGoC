import {
  setClientBillingConfig,
  getClientBillingConfig,
  generateInvoice,
  getInvoiceWithLines,
  finalizeInvoice,
  markPaid,
  reconcilePeriod,
  listUnattributedWorkedDays,
  listInvoices,
} from './service';

export {
  setClientBillingConfig,
  getClientBillingConfig,
  generateInvoice,
  getInvoiceWithLines,
  finalizeInvoice,
  markPaid,
  reconcilePeriod,
  listUnattributedWorkedDays,
  listInvoices,
};
export type { BillingInvoiceWithLines, ReconcileMismatch, SetClientBillingConfigInput } from './service';

export type { BillingInvoice, BillingInvoiceLine, ClientBillingConfig } from './schema';

export const billing = {
  setClientBillingConfig,
  getClientBillingConfig,
  generateInvoice,
  getInvoiceWithLines,
  finalizeInvoice,
  markPaid,
  reconcilePeriod,
  listUnattributedWorkedDays,
  listInvoices,
};
