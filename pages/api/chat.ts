import { DEFAULT_SYSTEM_PROMPT, DEFAULT_TEMPERATURE } from '@/utils/app/const';
import { OpenAIError, OpenAIStream } from '@/utils/server';

import { ChatBody, Message } from '@/types/chat';
import { OpenAIModelID, OpenAITokenizers } from '@/types/openai';

export const config = {
  runtime: 'edge',
};

const handler = async (req: Request): Promise<Response> => {
  const json = (await req.json()) as ChatBody;
  const { rag } = json;

  if (rag) {
    return handleChatWithRag(json);
  }
  return handleChat(json);
};

const handleChat = async (json: ChatBody): Promise<Response> => {
  try {
    const { url, model, messages, key, prompt, temperature } = json;

    let promptToSend = prompt;
    if (!promptToSend) {
      promptToSend = DEFAULT_SYSTEM_PROMPT;
    }

    let temperatureToUse = temperature;
    if (temperatureToUse == null) {
      temperatureToUse = DEFAULT_TEMPERATURE;
    }

    const tokenizer = OpenAITokenizers[model.id as OpenAIModelID];
    const prompt_tokens = tokenizer.encode(promptToSend);

    let tokenCount = prompt_tokens.length;
    let messagesToSend: Message[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const tokens = tokenizer.encode(message.content);

      if (tokenCount + tokens.length + 768 > model.tokenLimit) {
        break;
      }
      tokenCount += tokens.length;
      messagesToSend = [message, ...messagesToSend];
    }

    const stream = await OpenAIStream(
      url,
      model,
      promptToSend,
      temperatureToUse,
      key,
      messagesToSend,
    );

    return new Response(stream);
  } catch (error) {
    console.error(error);
    if (error instanceof OpenAIError) {
      return new Response('Error', { status: 500, statusText: error.message });
    } else {
      return new Response('Error', { status: 500 });
    }
  }
};

const handleChatWithRag = async (json: ChatBody): Promise<Response> => {
  try {
    const { url, model, messages, key, prompt, temperature, searchResults } =
      json;

    let promptToSend = "You are NosanaGPT. Provide helpful answers to the user's questions. You will get a query and context. Only use parts of the provided context that are relevant to the query."
    let temperatureToUse = temperature ?? DEFAULT_TEMPERATURE;

    let messagesToSend: Message[] = [...messages];
    const lastMessage = messages[messages.length - 1];
    const userMessage = lastMessage.content;

    // Check for Nosana price request
    if (
      userMessage.toLowerCase().includes('nosana price') ||
      userMessage.toLowerCase().includes('price of nosana')
    ) {
      const price = await getNosanaPrice();
      if (price) {
        const priceContext = `The current price of Nosana is $${price.toFixed(
          4,
        )}. Respond with just the price, prefaced by "The price of Nosana is: X$".`;
        messagesToSend[
          messagesToSend.length - 1
        ].content = `${lastMessage.content}\n\nContext: ${priceContext}`;
      }
    } else {
      // Use the search results provided by the client
      messagesToSend[
        messagesToSend.length - 1
      ].content = `Query:\n${userMessage}\n\nContext:\n${searchResults}`;
    }

    // Token counting logic (unchanged)
    const tokenizer = OpenAITokenizers[model.id as OpenAIModelID];
    const prompt_tokens = tokenizer.encode(promptToSend);
    let tokenCount = prompt_tokens.length;
    let filteredMessages: Message[] = [];

    for (let i = messagesToSend.length - 1; i >= 0; i--) {
      const message = messagesToSend[i];
      const tokens = tokenizer.encode(message.content);

      if (tokenCount + tokens.length + 768 > model.tokenLimit) {
        break;
      }
      tokenCount += tokens.length;
      filteredMessages = [message, ...filteredMessages];
    }

    console.log(filteredMessages);

    const stream = await OpenAIStream(
      url,
      model,
      promptToSend,
      temperatureToUse,
      key,
      filteredMessages,
    );

    return new Response(stream);
  } catch (error) {
    console.error(error);
    if (error instanceof OpenAIError) {
      return new Response('Error', { status: 500, statusText: error.message });
    } else {
      return new Response('Error', { status: 500 });
    }
  }
};

export default handler;

async function getNosanaPrice() {
  try {
    const options = {
      method: 'GET',
      headers: {
        'X-API-KEY': '0e0f7de74e9d42e0afdccd562e2fe78d',
      },
    };
    const response = await fetch(
      'https://public-api.birdeye.so/defi/price?address=nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7',
      options,
    );
    const data = await response.json();
    return data.data.value;
  } catch (error) {
    console.error('Error fetching Nosana price:', error);
    return null;
  }
}
