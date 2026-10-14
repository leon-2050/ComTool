import {invoke,isTauri,Channel} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {DataFrame} from './types';
export const native=isTauri();
export async function call<T>(command:string,args?:Record<string,unknown>):Promise<T>{
  if(!native)throw new Error('浏览器仅展示界面；请运行 ComTool 桌面程序使用通信功能。');
  return invoke<T>(command,args);
}
export function channel(callback:(frame:DataFrame)=>void){const value=new Channel<DataFrame>();value.onmessage=callback;return value}
export async function onEvent<T>(name:string,callback:(value:T)=>void){return native?listen<T>(name,e=>callback(e.payload)):()=>{}}
