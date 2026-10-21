import {it,expect} from 'vitest';
import {defaultSession} from './types';
import {connectionConfig,connectionChanged,sameIdentity} from './connection';

it('stages connection fields without leaking history, display, or credentials into the profile',()=>{
  const s=defaultSession();const secrets={password:'',passphrase:''};
  const draft={config:{...connectionConfig(s),baud:9600},secrets};
  expect(connectionChanged(s,secrets,draft)).toBe(true);expect(s.baud).toBe(115200);
  expect(draft.config).not.toHaveProperty('history');expect(draft.config).not.toHaveProperty('encoding');expect(draft.config).not.toHaveProperty('password');
  expect(connectionChanged(s,secrets,{config:connectionConfig(s),secrets})).toBe(false);
  expect(connectionChanged(s,secrets,{config:connectionConfig(s),secrets:{...secrets,password:'new'}})).toBe(true);
});
it('reuses SSH credentials only for the same endpoint and authentication identity',()=>{
  const s=connectionConfig(defaultSession('ssh'));expect(sameIdentity(s,{...s,reconnect:true})).toBe(true);
  for(const change of [{host:'other'},{port:2222},{user:'other'},{keyFile:'other'},{kind:'tcp' as const}])expect(sameIdentity(s,{...s,...change})).toBe(false);
});
