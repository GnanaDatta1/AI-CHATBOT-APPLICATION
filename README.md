# 🤖 Live AI Chatbot Application

A production-ready real-time AI chatbot application built with **Node.js**, **Express**, **Socket.io**, and the **OpenAI API**.

This project supports live AI responses with token streaming, isolated client sessions, rate limiting, and a modern responsive frontend.

---

# 📸 Preview

## Chat Interface




![image alt](https://github.com/GnanaDatta1/AI-CHATBOT-APPLICATION/blob/64b8e53abf6733e2f9dea4153ae28fa266749faa/images/Screenshot%202026-05-25%20142503.png)





# 🚀 Features

* ⚡ Real-time AI chat using Socket.io
* 🤖 OpenAI streaming responses
* 🔒 Environment variable security
* 👥 Multi-client isolated sessions
* 🧠 Conversation history management
* 🛡️ Rate limiting protection
* 🎨 Modern responsive UI with Tailwind CSS
* 🌐 Express backend server
* 🔄 Auto reconnect support
* 📱 Mobile responsive design

---

# 🛠️ Tech Stack

## Frontend

* HTML5
* CSS3
* Tailwind CSS
* Vanilla JavaScript
* Socket.io Client

## Backend

* Node.js
* Express.js
* Socket.io
* OpenAI SDK
* dotenv
* cors
* uuid

---

# 📂 Project Structure

```bash
AI_CHATBOT_APPLICATION/
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── images/
│   ├── Screenshot 2026-05-25 142503.png
│   └── Screenshot 2026-05-25 142709.png
│
├── server.js
├── package.json
├── package-lock.json
├── .env.example
└── README.md
```

---

# ⚙️ Installation

## 1️⃣ Clone the Repository

```bash
git clone https://github.com/your-username/live-ai-chatbot.git
```

```bash
cd live-ai-chatbot
```

---

## 2️⃣ Install Dependencies

```bash
npm install
```

---

## 3️⃣ Configure Environment Variables

Create a `.env` file in the root folder.

Copy the contents from `.env.example`.

Example:

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
PORT=3000
CORS_ORIGIN=*
MAX_TOKENS=1024
MAX_CONTEXT_TOKENS=4096
RATE_LIMIT_PER_MINUTE=20
```

---

# ▶️ Running the Application

## Development Mode

```bash
npm run dev
```

## Production Mode

```bash
npm start
```

---

# 🌍 Open in Browser

After starting the server, open:

```bash
http://localhost:3000
```

---

# 🔐 Environment Variables

| Variable              | Description                 |
| --------------------- | --------------------------- |
| OPENAI_API_KEY        | Your OpenAI API key         |
| OPENAI_BASE_URL       | OpenAI API base URL         |
| OPENAI_MODEL          | AI model name               |
| PORT                  | Server port                 |
| CORS_ORIGIN           | Allowed frontend origins    |
| MAX_TOKENS            | Maximum output tokens       |
| MAX_CONTEXT_TOKENS    | Maximum chat history tokens |
| RATE_LIMIT_PER_MINUTE | Request limit per minute    |

---

# 🧠 How It Works

1. User sends a message from the frontend.
2. Socket.io sends the message to the Node.js server.
3. Server validates and processes the request.
4. OpenAI API streams the AI response.
5. Tokens are streamed back to the frontend in real time.
6. Conversation history is stored per client session.

---

# 📦 Available Scripts

| Command     | Description                              |
| ----------- | ---------------------------------------- |
| npm start   | Start production server                  |
| npm run dev | Start development server with watch mode |

---

# 🔒 Security Features

* API keys stored in `.env`
* Session isolation between clients
* Input validation
* Rate limiting
* CORS protection
* Error handling

---

# 📱 Responsive Design

The application is optimized for:

* Desktop
* Tablet
* Mobile devices

---

# 🚀 Deployment

You can deploy this project on:

* Render
* Railway
* Vercel
* Netlify (frontend only)
* AWS
* DigitalOcean

---

# 🐛 Common Issues

## OPENAI_API_KEY not set

Make sure your `.env` file contains a valid API key.

## Port already in use

Change the `PORT` value in `.env`.

## Dependencies not installed

Run:

```bash
npm install
```

---

# 📄 License

This project is licensed under the MIT License.

---

# 👨‍💻 Author

Developed by **Gnana Datta**

---

# ⭐ Support

If you like this project:

* Give it a ⭐ on GitHub
* Fork the repository
* Share it with others

---

# 📬 Contact

Feel free to connect and contribute to the project.
