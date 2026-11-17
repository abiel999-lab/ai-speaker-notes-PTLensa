export function creativeReasoningPolicy(value='medium'){
 if(!['low','medium','high'].includes(value))throw Error('REASONING_EFFORT_NOT_ALLOWED');
 return {effort:value,timeoutMs:value==='high'?300000:value==='medium'?180000:120000,maxOutputTokens:value==='high'?48000:value==='medium'?32000:24000};
}
