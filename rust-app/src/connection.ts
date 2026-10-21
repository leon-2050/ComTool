import type {Session,Secrets} from './types';

export const connectionKeys=['kind','host','port','bindHost','bindPort','server','device','baud','dataBits','parity','stopBits','flow','rts','dtr','user','keyFile','rememberSecret','reconnect','reconnectInterval'] as const;
export type ConnectionConfig=Pick<Session,typeof connectionKeys[number]>;
export interface ConnectionDraft {config:ConnectionConfig;secrets:Secrets}
export function connectionConfig(session:Session):ConnectionConfig {
  return Object.fromEntries(connectionKeys.map(key=>[key,session[key]])) as ConnectionConfig;
}
export function sameIdentity(a:ConnectionConfig,b:ConnectionConfig){
  return a.kind===b.kind&&a.host===b.host&&a.port===b.port&&a.user===b.user&&a.keyFile===b.keyFile;
}
export function connectionChanged(session:Session,secrets:Secrets,draft?:ConnectionDraft){
  return !!draft&&(connectionKeys.some(key=>session[key]!==draft.config[key])||secrets.password!==draft.secrets.password||secrets.passphrase!==draft.secrets.passphrase);
}
