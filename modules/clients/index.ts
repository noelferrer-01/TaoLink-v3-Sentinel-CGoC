import {
  createClient,
  getClient,
  updateClient,
  deleteClient,
  listClients,
  listClientsWithDetachments,
  createDetachment,
  getDetachment,
  updateDetachment,
  listDetachments,
  getDetachmentDeploymentSummary,
  listDetachmentsWithDeployment,
} from './service';

export type { ClientWithDetachments, DeploymentSummary, DetachmentWithDeployment } from './service';

export const clients = {
  createClient,
  getClient,
  updateClient,
  deleteClient,
  listClients,
  listClientsWithDetachments,
  createDetachment,
  getDetachment,
  updateDetachment,
  listDetachments,
  getDetachmentDeploymentSummary,
  listDetachmentsWithDeployment,
};
export {
  createClient,
  getClient,
  updateClient,
  deleteClient,
  listClients,
  listClientsWithDetachments,
  createDetachment,
  getDetachment,
  updateDetachment,
  listDetachments,
  getDetachmentDeploymentSummary,
  listDetachmentsWithDeployment,
};
