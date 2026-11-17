"""Customer credit units, distinct from provider API token counts."""
RATES={'gpt-6-luna':1,'gpt-6.1-terra':3,'gpt-5.6-luna':1}
def credits_for_slides(model,slides):
 key=getattr(model,'value',model)
 if key not in RATES or type(slides)is not int or not 0<=slides<=10000:raise ValueError('INVALID_MODEL_OR_SLIDE_COUNT')
 return RATES[key]*slides


def estimated_provider_cost(settings, *, model, input_tokens, output_tokens, cached_input_tokens=0):
 key=getattr(model,'value',model)
 if key!='gpt-6.1-terra':
  return settings.estimated_openai_cost_usd(model=key,input_tokens=input_tokens,output_tokens=output_tokens,cached_input_tokens=cached_input_tokens)
 total=max(int(input_tokens),0);cached=min(max(int(cached_input_tokens),0),total)
 return round(((total-cached)*1.0+cached*0.05+max(int(output_tokens),0)*5.0)/1_000_000,8)
