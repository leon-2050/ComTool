import {describe,it,expect} from 'vitest';
import {defaultSession,normalizeSessionView,type Kind} from './types';
describe('protocol view restrictions',()=>{for(const kind of ['serial','tcp','udp','ssh'] as Kind[])for(const view of ['receive','terminal'] as const)it(`${kind} repairs ${view}`,()=>{const session={...defaultSession(kind),view};const result=normalizeSessionView(session);expect(result.view).toBe(kind==='ssh'?'terminal':'receive');expect(result.kind).toBe(kind);expect(result.id).toBe(session.id);});});
