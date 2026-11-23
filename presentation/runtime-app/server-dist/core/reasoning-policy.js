export const reasoningEfforts = ['low','medium','high','xhigh'];
const settings = {
 low: {timeoutMs:120000,maxOutputTokens:24000},
 medium: {timeoutMs:180000,maxOutputTokens:32000},
 high: {timeoutMs:300000,maxOutputTokens:48000},
 xhigh: {timeoutMs:300000,maxOutputTokens:64000},
};
export function creativeReasoningPolicy(value='medium'){
 if(!reasoningEfforts.includes(value))throw Error('REASONING_EFFORT_NOT_ALLOWED');
 return {effort:value,...settings[value]};
}
