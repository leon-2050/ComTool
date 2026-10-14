export interface Highlight {start:number;end:number;color:string}
const rules:[RegExp,string][]=[
  [/<access denied>|\b(permission denied|access denied|not found|error|failed|failure|fatal|denied|invalid)\b/gi,'#ff6b6b'],
  [/\b(warning|warn|deprecated|unsupported|timeout)\b/gi,'#f6d06f'],[/\b(ok|success|passed|connected|enabled)\b/gi,'#83d68a'],
  [/\b0x[0-9a-f]+\b/gi,'#f6d06f'],[/(?<![\w/-])--?[A-Za-z][A-Za-z0-9_-]*(?:=[^\s]+)?/g,'#74dfe8'],
  [/(?<![\w.])(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(?![\w.])/g,'#ef87d7'],
];
export function highlightKeywords(text:string):Highlight[]{
  const cells:(string|undefined)[]=Array(text.length);for(const [regex,color]of rules){regex.lastIndex=0;for(const match of text.matchAll(regex))for(let i=match.index;i<match.index+match[0].length;i++)cells[i]=color;}
  const result:Highlight[]=[];for(let i=0;i<cells.length;){if(!cells[i]){i++;continue;}let end=i+1;while(end<cells.length&&cells[end]===cells[i])end++;result.push({start:i,end,color:cells[i]!});i=end;}return result;
}
