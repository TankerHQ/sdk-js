import type { Tanker } from '@tanker/core';

import type { AppProvisionalUser, AppHelper, ProvisionalUserType } from './AppHelper';
import { provisionalUserTypes } from './AppHelper';
import type { User } from './User';
import type { Device } from './Device';

const currentSessions: Array<UserSession> = [];

export class UserSession {
  appHelper: AppHelper;
  user: User;
  device: Device;
  session: Tanker;

  constructor(appHelper: AppHelper, user: User, device: Device, session: Tanker) {
    this.appHelper = appHelper;
    this.user = user;
    this.device = device;
    this.session = session;
    currentSessions.push(this);
  }

  static create = async (appHelper: AppHelper): Promise<UserSession> => {
    const user = await appHelper.makeUser();
    const device = await user.makeDevice();
    const session = await device.open();
    return new UserSession(appHelper, user, device, session);
  };

  static closeAllSessions = async () => {
    await Promise.all(currentSessions.map(s => s.session.stop()));
    currentSessions.length = 0;
  };

  get spublicIdentity(): string {
    return this.user.spublicIdentity;
  }

  get userSPublicIdentity(): string {
    return this.user.spublicIdentity;
  }
}

export class ProvisionalUserSession extends UserSession {
  provisionalUser: AppProvisionalUser;

  constructor(appHelper: AppHelper, user: User, device: Device, session: Tanker, provisionalUser: AppProvisionalUser) {
    super(appHelper, user, device, session);
    this.provisionalUser = provisionalUser;
  }

  static override create = async (appHelper: AppHelper, type: ProvisionalUserType = provisionalUserTypes.email): Promise<ProvisionalUserSession> => {
    const userSession = await UserSession.create(appHelper);
    const provisionalUser = await appHelper.generateProvisionalUser(type);
    return new ProvisionalUserSession(appHelper, userSession.user, userSession.device, userSession.session, provisionalUser);
  };

  override get spublicIdentity(): string {
    return this.provisionalUser.publicIdentity;
  }

  override get userSPublicIdentity(): string {
    return this.user.spublicIdentity;
  }

  attach = (): Promise<void> => this.appHelper.attachVerifyProvisionalIdentity(this.session, this.provisionalUser);
}

export const generateUserSession = async (appHelper: AppHelper, nb: number): Promise<Array<UserSession>> => Promise.all(Array.from({ length: nb }, _ => UserSession.create(appHelper)));
export const generateProvisionalUserSession = async (appHelper: AppHelper, nbEmail: number, nbPhoneNumber: number): Promise<Array<ProvisionalUserSession>> => Promise.all(
  Array.from({ length: nbEmail }, _ => ProvisionalUserSession.create(appHelper, provisionalUserTypes.email))
    .concat(Array.from({ length: nbPhoneNumber }, _ => ProvisionalUserSession.create(appHelper, provisionalUserTypes.phoneNumber))),
);

export const getPublicIdentities = (...sessions: Array<ProvisionalUserSession | UserSession>): Array<string> => sessions.map(s => s.spublicIdentity);

export const attachProvisionalIdentities = async (sessions: Array<ProvisionalUserSession>) => {
  await Promise.all(sessions.map(s => s.attach()));
};
