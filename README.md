# ✨ OpenChat UI

OpenChat UI is a forked version of Chatbot UI that supports OpenChat models.

<div align="center">
  <img src="https://raw.githubusercontent.com/imoneoi/openchat/master/assets/logo_new.png" style="width: 80%;">
</div>

![Chatbot UI](./public/screenshots/screenshot-0402023.jpg)

# 🚀 Deploy

## 💻 Running Locally

**1. Clone Repo**

```bash
git clone https://github.com/imoneoi/openchat-ui.git
```

**2. Install Dependencies**

```bash
npm i
```

**3. Configuration** <a id="configuration"></a>

> [!WARNING]
> The following config assumes OpenChat API server is listening on `http://localhost:18888`. You should [set it up](https://github.com/imoneoi/openchat#-deploying-api-server) if not.

> [!NOTE]
> Please note that OpenChat API server is using an OpenAI-compatible API protocol running locally. `OPENAI_API_KEY` can be set to anything (no actual OpenAI API key needed).

Create a .env.local file in the root of the repo with the following content.

```bash
OPENAI_API_HOST=http://localhost:18888
OPENAI_API_KEY=sk-dummy
NEXT_PUBLIC_DEFAULT_TEMPERATURE=0.2
NEXT_PUBLIC_DEFAULT_SYSTEM_PROMPT=" "
```

**4. Run App**

```bash
npm run dev
```

**5. Use It**

You should be able to start chatting.

## 📎 Vercel

Host your own live version of Chatbot UI with Vercel. Note that you should set environment variables shown in the [Configuration](#configuration) section in Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fimone%2Fopenchat-ui)
