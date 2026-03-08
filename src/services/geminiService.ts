export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export async function* generateCodeStream(
  messages: ChatMessage[],
  systemInstruction?: string
) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      systemInstruction,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    // Process SSE messages
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') {
          return;
        }
        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            if (data.text) {
              yield data.text;
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    }
  }
}

