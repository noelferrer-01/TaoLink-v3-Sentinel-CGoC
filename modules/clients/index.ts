import {
  createClient,
  getClient,
  updateClient,
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
  listClients,
  listClientsWithDetachments,
  createDetachment,
  getDetachment,
  updateDetachment,
  listDetachments,
  getDetachmentDeploymentSummary,
  listDetachmentsWithDeployment,
};
