/**
 * OpenAI 兼容的 Chat Completions 客户端（Node 18+ 内置 fetch）
 * 兼容：DeepSeek / 豆包火山方舟 / 智谱 GLM / Kimi / 任意 OpenAI 兼容中转
 */

async function chatCompletion({ baseUrl, apiKey, model, messages, temperature = 0.9, maxTokens = 1800 }) {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' } // 多数兼容服务支持；不支持的会忽略该字段或报错，报错则重试不带
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // 个别服务不支持 response_format，去掉重试一次
    if (res.status === 400 && /response_format|json_object/i.test(text)) {
      return chatCompletionRaw({ baseUrl, apiKey, model, messages, temperature, maxTokens });
    }
    throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM 返回为空');
  return content;
}

async function chatCompletionRaw({ baseUrl, apiKey, model, messages, temperature, maxTokens }) {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens })
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

// 从可能被代码块包裹的文本里提取 JSON
function extractJson(text) {
  if (!text) throw new Error('空内容');
  let t = text.trim();
  // 去除 ```json ... ``` 包裹
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // 截取第一个 { 到最后一个 }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

module.exports = { chatCompletion, extractJson };
