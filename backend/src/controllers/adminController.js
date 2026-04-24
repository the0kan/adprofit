import {
  getAdminSummaryData,
  getAdminUsersData,
  getAdminWorkspacesData,
  getAdminIntegrationsData,
  getAdminSystemData,
} from "../services/adminService.js";

export async function getAdminSummary(_req, res) {
  const data = await getAdminSummaryData();
  return res.json(data);
}

export async function getAdminUsers(_req, res) {
  const data = await getAdminUsersData();
  return res.json(data);
}

export async function getAdminWorkspaces(_req, res) {
  const data = await getAdminWorkspacesData();
  return res.json(data);
}

export async function getAdminIntegrations(_req, res) {
  const data = await getAdminIntegrationsData();
  return res.json(data);
}

export async function getAdminSystem(_req, res) {
  const data = await getAdminSystemData();
  return res.json(data);
}
