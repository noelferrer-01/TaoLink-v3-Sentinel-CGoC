import {
  SESSION_COOKIE_NAME,
  login,
  logout,
  findSessionByToken,
  getSessionFromCookie,
  requireUser,
  createUser,
} from './service';

export const auth = {
  SESSION_COOKIE_NAME,
  login,
  logout,
  findSessionByToken,
  getSessionFromCookie,
  requireUser,
  createUser,
};

export { getSessionFromCookie, requireUser };
export type { SessionRecord, LoginResult } from './service';
