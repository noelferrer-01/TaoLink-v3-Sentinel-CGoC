import {
  createClient,
  getClient,
  listClients,
  listClientsWithDetachments,
  createDetachment,
  getDetachment,
  listDetachments,
} from './service';

export type { ClientWithDetachments } from './service';

export const clients = {
  createClient,
  getClient,
  listClients,
  listClientsWithDetachments,
  createDetachment,
  getDetachment,
  listDetachments,
};
export {
  createClient,
  getClient,
  listClients,
  listClientsWithDetachments,
  createDetachment,
  getDetachment,
  listDetachments,
};
